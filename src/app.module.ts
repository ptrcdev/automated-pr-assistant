import { Logger, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { StaticAnalysisService } from './static-analysis/static-analysis.service';
import { WebhookController } from './webhook/webhook.controller';

@Module({
  imports: [],
  controllers: [AppController, WebhookController],
  providers: [AppService, StaticAnalysisService, Logger],
})
export class AppModule {}
