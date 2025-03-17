import { Injectable } from '@nestjs/common';

@Injectable()
export class StaticAnalysisService {
  analyzeCode(code: string): Record<string, number> {
    // Simulate ESLint scores
    // In a real-world scenario, you might spawn an ESLint process or use an API
    return {
      formatting: 80,
      content_quality: 75,
      structure: 70,
      keyword_optimization: 65,
      readability: 60,
      achievements: 85,
      professionalism: 90,
    };
  }
}
