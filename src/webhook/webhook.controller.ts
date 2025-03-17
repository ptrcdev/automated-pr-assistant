import { Controller, Post, Body, Headers, HttpException, HttpStatus } from '@nestjs/common';
import { StaticAnalysisService } from '../static-analysis/static-analysis.service';
import fetch from 'node-fetch'; // Make sure to install node-fetch if you're using Node 16 or below

interface PythonResponse {
  openai_feedback: string;
}

interface FileAnalysis {
  filename: string;
  aiFeedback: string;
}

@Controller('webhook')
export class WebhookController {

  @Post()
  async handleWebhook(
    @Headers('x-github-event') event: string,
    @Body() payload: any,
  ) {
    console.log(`Received webhook event: ${event}`);

    // Extract commit data; adjust according to your payload structure.
    const commits = payload.commits || [];

    // Prepare an array to hold analysis for each file.
    const fileAnalyses: FileAnalysis[] = [];

    for (const commit of commits) {
      // For each commit, get the list of modified files.
      const modifiedFiles = commit.modified || [];
      for (const filename of modifiedFiles) {
        // Assume you have a way to fetch the content of each file
        // (This might require additional API calls to GitHub's API)
        // For this example, we'll simulate by using the commit message if the file is a README,
        // and a "default" code snippet for main.py.
        let fileContent = "";

        fileContent = commit.message; // Simulated content for README

        // Forward each file's content to the Python AI feedback service.
        const pythonApiUrl = process.env.PYTHON_API_URL || "http://your-python-api-domain/analyze";
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
        } catch (err) {
          aiFeedback = `Error fetching AI feedback: ${err.message}`;
        }

        // Push the analysis for this file into our array.
        fileAnalyses.push({
          filename,
          aiFeedback,
        });
      }
    }

    // Return the aggregated analysis for each file.
    return {
      message: 'Webhook received',
      fileAnalyses,
    };
  }
}
