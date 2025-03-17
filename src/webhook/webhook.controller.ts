import { Controller, Post, Body, Headers, HttpException, HttpStatus } from '@nestjs/common';
import { StaticAnalysisService } from '../static-analysis/static-analysis.service';
import fetch from 'node-fetch'; // Make sure to install node-fetch if you're using Node 16 or below

interface PythonResponse {
  openai_feedback: string;
}
@Controller('webhook')
export class WebhookController {
  constructor(private readonly staticAnalysisService: StaticAnalysisService) {}

  @Post()
  async handleWebhook(
    @Headers('x-github-event') event: string,
    @Body() payload: any,
  ) {
    console.log(`Received webhook event: ${event}`);
    
    // Extract a code snippet (e.g., commit message or code diff) from the payload.
    const codeSnippet = payload.commits?.[0]?.message || "default code snippet";
    
    // Run static analysis on the code snippet.
    const staticScores = this.staticAnalysisService.analyzeCode(codeSnippet);
    
    // Forward the code snippet to the Python AI feedback service.
    const pythonApiUrl = process.env.PYTHON_API_URL || "http://localhost:8000/analyze";
    let aiFeedback: string;
    try {
      const pythonResponse = await fetch(pythonApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: codeSnippet,
          context: "code review",
        }),
      });
      if (!pythonResponse.ok) {
        throw new Error(`Python API error: ${pythonResponse.statusText}`);
      }
      const data: PythonResponse = await pythonResponse.json() as PythonResponse;
      aiFeedback = data.openai_feedback;
    } catch (err) {
      throw new HttpException(`Failed to get AI feedback: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    console.log('AI Feedback:', aiFeedback);

    // Return the aggregated result.
    return {
      message: 'Webhook received',
      analysis: {
        staticScores,
        aiFeedback,
      },
    };
  }
}
