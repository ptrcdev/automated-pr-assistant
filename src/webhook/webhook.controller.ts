import { Controller, Post, Body, Headers, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { StaticAnalysisService } from '../static-analysis/static-analysis.service';
import fetch from 'node-fetch'; // Make sure to install node-fetch if you're using Node 16 or below

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

  @Post()
  async handleWebhook(
    @Headers('x-github-event') event: string,
    @Body() payload: any,
  ) {
    this.logger.log(`Received webhook event: ${event}`);

    const commits: Commit[] = payload.commits || [];
    const pythonApiUrl = process.env.PYTHON_API_URL;
    if (!pythonApiUrl) {
      this.logger.error("Python API URL is not configured");
      throw new HttpException("Python API URL is not configured", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // Use Promise.all to process files in parallel per commit.
    const fileAnalysesPromises = commits.flatMap(commit => {
      // Use modified files if available
      const modifiedFiles = commit.modified || [];
      return modifiedFiles.map(async filename => {
        // If the payload includes file content, use that; otherwise, use commit message as a fallback.
        // Replace this with the actual extraction logic.
        const fileContent = commit.message || "No content provided";

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
