import { Test, TestingModule } from '@nestjs/testing';
import { StaticAnalysisService } from './static-analysis.service';

describe('StaticAnalysisService', () => {
  let service: StaticAnalysisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StaticAnalysisService],
    }).compile();

    service = module.get<StaticAnalysisService>(StaticAnalysisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
