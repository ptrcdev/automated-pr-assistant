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

@Controller('webhook')
export class WebhookController {

  constructor(private readonly logger: Logger) {}

  private readonly MIN_CONTENT_LENGTH = 50;
  
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

    const fileAnalysesPromises = commits.flatMap(commit => {
      const modifiedFiles = commit.modified || [];
      return modifiedFiles.map(async filename => {
        const fileContent = commit.message || "No content provided";

        // Adding this to skip review when commits are too irrelavant or small changes.
        if (fileContent.length < this.MIN_CONTENT_LENGTH) {
          this.logger.log(`Skipping file ${filename} due to insufficient content length`);
          return {
            filename,
            aiFeedback: "Insufficient content",
          } as FileAnalysis;
        }

        this.logger.log(`Processing file: ${filename}`);

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
