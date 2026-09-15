import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ForwardersService,
  CreateForwarderDto,
  UpdateForwarderDto,
} from './forwarders.service';

@ApiTags('forwarders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('forwarders')
export class ForwardersController {
  constructor(private readonly service: ForwardersService) {}

  @Get()
  async list(@Req() req: { user: { id: bigint; publicSlug?: string } }) {
    const forwarders = await this.service.list(req.user.id);
    return { userSlug: req.user.publicSlug, forwarders };
  }

  @Post()
  create(@Req() req: { user: { id: bigint } }, @Body() body: CreateForwarderDto) {
    return this.service.create(req.user.id, body);
  }

  @Patch(':id')
  update(
    @Req() req: { user: { id: bigint } },
    @Param('id') id: string,
    @Body() body: UpdateForwarderDto,
  ) {
    return this.service.update(req.user.id, BigInt(id), body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() req: { user: { id: bigint } }, @Param('id') id: string) {
    return this.service.remove(req.user.id, BigInt(id));
  }
}
