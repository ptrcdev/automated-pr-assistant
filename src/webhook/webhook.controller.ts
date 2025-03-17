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
  modified?: string[];
  // Optionally, if available:
  files?: { filename: string; diff: string }[];
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

    if (!pythonApiUrl) {
      this.logger.error("Python API URL is not configured");
      throw new HttpException("Python API URL is not configured", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    console.log(commits);

    const fileAnalysesPromises = commits.flatMap(commit => {
      // If the payload includes a 'files' array with diffs, use it.
      if (commit.files && Array.isArray(commit.files)) {
        return commit.files.map(async (file) => {
          const fileContent = file.diff;
          this.logger.log(`Processing file ${file.filename} with diff length ${fileContent.length}`);
          
          if (fileContent.length < this.MIN_CONTENT_LENGTH) {
            this.logger.log(`Skipping file ${file.filename} due to insufficient diff length`);
            return {
              filename: file.filename,
              aiFeedback: "Insufficient changes to analyze.",
            } as FileAnalysis;
          }
          
          let aiFeedback = "";
          try {
            const pythonResponse = await fetch(pythonApiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: fileContent,
                context: "code review",
              }),
            });
            if (!pythonResponse.ok) {
              throw new Error(`Python API error: ${pythonResponse.statusText}`);
            }
            const data: PythonResponse = await pythonResponse.json() as PythonResponse;
            aiFeedback = data.openai_feedback;
          } catch (err: any) {
            this.logger.error(`Error fetching AI feedback for file ${file.filename}: ${err.message}`);
            aiFeedback = `Error fetching AI feedback: ${err.message}`;
          }
          return {
            filename: file.filename,
            aiFeedback,
          } as FileAnalysis;
        });
      } else {
        // Fallback: use commit.modified array and commit.message as content.
        const modifiedFiles = commit.modified || [];
        return modifiedFiles.map(async filename => {
          // Use commit.message as a fallback; ideally, you'd fetch the actual file diff via GitHub API.
          const fileContent = commit.message || "";
          this.logger.log(`Processing file ${filename} using commit message with length ${fileContent.length}`);
          
          if (fileContent.length < 10) {
            this.logger.log(`Skipping file ${filename} due to insufficient content length`);
            return {
              filename,
              aiFeedback: "Insufficient content to analyze.",
            } as FileAnalysis;
          }
          
          let aiFeedback = "";
          try {
            const pythonResponse = await fetch(pythonApiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: fileContent,
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
      }
    });

    const fileAnalyses: FileAnalysis[] = await Promise.all(fileAnalysesPromises);

    this.logger.log({
      message: 'Webhook received',
      fileAnalyses,
    });

    return {
      message: 'Webhook received',
      fileAnalyses,
    };
  }
}
