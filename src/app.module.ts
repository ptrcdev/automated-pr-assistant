import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebhookController } from './webhook/webhook.controller';
import { GmailService } from './gmail/gmail.service';

@Module({
  imports: [ConfigModule.forRoot({
    isGlobal: true,
  })],
  controllers: [WebhookController],
  providers: [Logger, GmailService],
})
export class AppModule {}
