import { Controller, Post, Body, Headers, HttpException, HttpStatus, Logger } from '@nestjs/common';
import fetch from 'node-fetch';

interface PythonResponse {
  openai_feedback: string;
}

interface FileAnalysis {
  filename: string;
  aiFeedback: string;
}

interface Commit {
  id: string;
  message: string;
  modified: string[];
}

interface GitHubFile {
  filename: string;
  patch?: string;
}

@Controller('webhook')
export class WebhookController {
  private readonly MIN_CONTENT_LENGTH = 50;
  private readonly logger = new Logger(WebhookController.name);

  @Post()
  async handleWebhook(
    @Headers('x-github-event') event: string,
    @Body() payload: any,
  ) {
    this.logger.log(`Received webhook event: ${event}`);

    const commits: Commit[] = payload.commits || [];
    const pythonApiUrl = process.env.PYTHON_API_URL || "http://localhost:8000/analyze";
    const githubToken = process.env.GITHUB_API_TOKEN;
    
    if (!pythonApiUrl) {
      this.logger.error("Python API URL is not configured");
      throw new HttpException("Python API URL is not configured", HttpStatus.INTERNAL_SERVER_ERROR);
    }
    if (!githubToken) {
      this.logger.error("GitHub token is not configured");
      throw new HttpException("GitHub token is not configured", HttpStatus.INTERNAL_SERVER_ERROR);
    }
    
    // Extract repository details from the payload
    const repoFullName = payload.repository?.full_name;
    if (!repoFullName) {
      this.logger.error("Repository information is missing in payload");
      throw new HttpException("Repository information is missing", HttpStatus.BAD_REQUEST);
    }
    const [owner, repo] = repoFullName.split('/');

    // For each commit, fetch the diff details using GitHub's API.
    const fileAnalysesPromises = commits.flatMap(async (commit) => {
      // GitHub API URL to fetch commit details
      const commitUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${commit.id}`;
      let commitDetails;
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
        return []; // Skip processing this commit
      }
      
      // Extract changed files from the commit details
      const files: GitHubFile[] = commitDetails.files || [];
      
      return commit.modified.map(async (filename) => {
        const fileData = files.find((f) => f.filename === filename);
        if (!fileData || !fileData.patch) {
          this.logger.log(`Skipping file ${filename} because diff is not available`);
          return {
            filename,
            aiFeedback: "Diff not available for analysis.",
          } as FileAnalysis;
        }
        
        const diffContent = fileData.patch;
        this.logger.log(`Processing file ${filename} with diff length ${diffContent.length}`);
        
        if (diffContent.length < this.MIN_CONTENT_LENGTH) {
          this.logger.log(`Skipping file ${filename} due to insufficient diff content`);
          return {
            filename,
            aiFeedback: "Insufficient diff content to analyze.",
          } as FileAnalysis;
        }
        
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
        } as FileAnalysis;
      });
    });
    
    // Flatten the promises array and await them
    const flattenedPromises = fileAnalysesPromises.flat();
    const fileAnalyses = await Promise.all(flattenedPromises);

    this.logger.log({
      message: 'Webhook processed',
      fileAnalyses,
    });

    return {
      message: 'Webhook received',
      fileAnalyses,
    };
  }
}
