import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsOptional,
  IsNumber,
  IsBoolean,
  ValidateNested,
  Min,
  Max,
  ArrayMaxSize,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

class BulkMessageContentDto {
  @ApiPropertyOptional({ description: 'Text content for text messages' })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({ description: 'Image URL or base64' })
  @IsOptional()
  @IsObject()
  image?: { url?: string; base64?: string; mimetype?: string };

  @ApiPropertyOptional({ description: 'Video URL or base64' })
  @IsOptional()
  @IsObject()
  video?: { url?: string; base64?: string; mimetype?: string };

  @ApiPropertyOptional({ description: 'Audio URL or base64' })
  @IsOptional()
  @IsObject()
  audio?: { url?: string; base64?: string; mimetype?: string };

  @ApiPropertyOptional({ description: 'Document URL or base64' })
  @IsOptional()
  @IsObject()
  document?: { url?: string; base64?: string; mimetype?: string; filename?: string };

  @ApiPropertyOptional({ description: 'Caption for media messages' })
  @IsOptional()
  @IsString()
  caption?: string;
}

class BulkMessageItemDto {
  @ApiProperty({ description: 'Recipient chat ID', example: '628123456789@c.us' })
  @IsString()
  chatId: string;

  @ApiProperty({ description: 'Message type', enum: ['text', 'image', 'video', 'audio', 'document'] })
  @IsString()
  type: 'text' | 'image' | 'video' | 'audio' | 'document';

  @ApiProperty({ description: 'Message content based on type' })
  @ValidateNested()
  @Type(() => BulkMessageContentDto)
  content: BulkMessageContentDto;

  @ApiPropertyOptional({ description: 'Variables for template substitution' })
  @IsOptional()
  variables?: Record<string, string>;
}

class BulkMessageOptionsDto {
  @ApiPropertyOptional({ description: 'Delay between messages in ms (min: 1000, default: 3000)', default: 3000 })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(60000)
  delayBetweenMessages?: number;

  @ApiPropertyOptional({ description: 'Add random 0-2s to delay', default: true })
  @IsOptional()
  @IsBoolean()
  randomizeDelay?: boolean;

  @ApiPropertyOptional({ description: 'Stop batch on first error', default: false })
  @IsOptional()
  @IsBoolean()
  stopOnError?: boolean;
}

export class SendBulkMessageDto {
  @ApiPropertyOptional({ description: 'Custom batch ID (auto-generated if not provided)' })
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiProperty({ description: 'Array of messages (max 1000 per request)', type: [BulkMessageItemDto] })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => BulkMessageItemDto)
  messages: BulkMessageItemDto[];

  @ApiPropertyOptional({ description: 'Batch processing options' })
  @IsOptional()
  @ValidateNested()
  @Type(() => BulkMessageOptionsDto)
  options?: BulkMessageOptionsDto;
}

export class BulkMessageResponseDto {
  @ApiProperty()
  batchId: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  totalMessages: number;

  @ApiPropertyOptional()
  estimatedCompletionTime?: string;

  @ApiProperty()
  statusUrl: string;
}
