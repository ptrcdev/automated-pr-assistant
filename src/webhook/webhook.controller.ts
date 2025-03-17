import { Controller, Post, Body, Headers, HttpException, HttpStatus, Logger } from '@nestjs/common';
import fetch from 'node-fetch';
import { markdownToHtml } from '../utils/markdown-to-html';
import { GmailService } from '../gmail/gmail.service';

interface PythonResponse {
  openai_feedback: string;
}

interface Commit {
  id: string;
  message: string;
  modified: string[];
  author: {
    email: string;
  };
}

interface FileAnalysis {
  filename: string;
  aiFeedback: string;
  commitAuthor?: string;
}

interface GitHubFile {
  filename: string;
  patch?: string;
}

@Controller('webhook')
export class WebhookController {
  private readonly MIN_CONTENT_LENGTH = 50;
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly gmailService: GmailService) { }

  @Post()
  async handleWebhook(
    @Headers('x-github-event') event: string,
    @Body() payload: any,
  ) {
    this.logger.log(`Received webhook event: ${event}`);

    const commits: Commit[] = payload.commits || [];
    const pythonApiUrl = process.env.PYTHON_API_URL || "http://localhost:8000/analyze";
    const githubToken = process.env.GITHUB_TOKEN;

    if (!pythonApiUrl) {
      this.logger.error("Python API URL is not configured");
      throw new HttpException("Python API URL is not configured", HttpStatus.INTERNAL_SERVER_ERROR);
    }
    if (!githubToken) {
      this.logger.error("GitHub token is not configured");
      throw new HttpException("GitHub token is not configured", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const repoFullName = payload.repository?.full_name;
    if (!repoFullName) {
      this.logger.error("Repository information is missing in payload");
      throw new HttpException("Repository information is missing", HttpStatus.BAD_REQUEST);
    }
    const [owner, repo] = repoFullName.split('/');

    const fileAnalysesPromises: Promise<FileAnalysis>[] = [];

    for (const commit of commits) {
      const commitUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${commit.id}`;
      const commitAuthor = commit.author?.email;
      let commitDetails: any;
      try {
        const ghResponse = await fetch(commitUrl, {
          headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        });
        if (!ghResponse.ok) {
          throw new Error(`GitHub API error: ${ghResponse.statusText}`);
        }
        commitDetails = await ghResponse.json();
      } catch (err: any) {
        this.logger.error(`Error fetching commit details for commit ${commit.id}: ${err.message}`);
        continue;
      }

      const files: GitHubFile[] = commitDetails.files || [];
      for (const filename of commit.modified || []) {
        const fileData = files.find((f) => f.filename === filename);
        if (!fileData || !fileData.patch) {
          this.logger.log(`Skipping file ${filename} because diff is not available`);
          fileAnalysesPromises.push(
            Promise.resolve({
              filename,
              aiFeedback: "Diff not available for analysis.",
            })
          );
          continue;
        }

        const diffContent = fileData.patch;
        this.logger.log(`Processing file ${filename} with diff length ${diffContent.length}`);

        if (diffContent.length < this.MIN_CONTENT_LENGTH) {
          this.logger.log(`Skipping file ${filename} due to insufficient diff content`);
          fileAnalysesPromises.push(
            Promise.resolve({
              filename,
              aiFeedback: "Insufficient diff content to analyze.",
            })
          );
          continue;
        }

        fileAnalysesPromises.push(
          (async (): Promise<FileAnalysis> => {
            let aiFeedback = "";
            try {
              const pythonResponse = await fetch(pythonApiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  content: diffContent,
                  context: "code review",
                }),
              });
              if (!pythonResponse.ok) {
                throw new Error(`Python API error: ${pythonResponse.statusText}`);
              }
              const data: PythonResponse = await pythonResponse.json() as PythonResponse;
              aiFeedback = data.openai_feedback;
            } catch (err: any) {
              this.logger.error(`Error fetching AI feedback for file ${filename}: ${err.message}`);
              aiFeedback = `Error fetching AI feedback: ${err.message}`;
            }
            return {
              filename,
              aiFeedback,
              commitAuthor,
            };
          })()
        );
      }
    }

    const fileAnalyses: FileAnalysis[] = await Promise.all(fileAnalysesPromises);
    const redactedFileAnalyses = fileAnalyses.map(analysis => ({
      ...analysis,
      commitAuthor: 'REDACTED'
    }));
    this.logger.log({ message: 'Webhook processed', redactedFileAnalyses });

    if (fileAnalyses[0].commitAuthor) {
      const subject = 'Your Automated Code Review';
      const combinedFeedback = fileAnalyses
        .map(f => `**${f.filename}:**\n${f.aiFeedback}`)
        .join('\n\n');
      const htmlBody = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h1 style="color: #2c3e50;">Code Review Analysis Report</h1>
          <p>Your commit has been analyzed. Below is the detailed feedback:</p>
          ${markdownToHtml(combinedFeedback)}
        </div>
      `;
      await this.gmailService.sendEmail(fileAnalyses[0].commitAuthor, subject, htmlBody);
    }
    return {
      message: 'Webhook received',
      fileAnalyses,
    };
  }
}
