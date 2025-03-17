import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { StaticAnalysisService } from './static-analysis/static-analysis.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, StaticAnalysisService],
})
export class AppModule {}
