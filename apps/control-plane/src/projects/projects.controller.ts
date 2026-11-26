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
import { ProjectsService } from './projects.service';
import type { CreateProjectDto, UpdateProjectDto } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get()
  list(@Req() req: { user: { id: bigint } }) {
    return this.service.list(BigInt(req.user.id));
  }

  @Post()
  create(@Req() req: { user: { id: bigint } }, @Body() body: CreateProjectDto) {
    return this.service.create(BigInt(req.user.id), body);
  }

  @Get(':id')
  detail(@Req() req: { user: { id: bigint } }, @Param('id') id: string) {
    return this.service.detail(BigInt(req.user.id), BigInt(id));
  }

  @Patch(':id')
  update(
    @Req() req: { user: { id: bigint } },
    @Param('id') id: string,
    @Body() body: UpdateProjectDto,
  ) {
    return this.service.update(BigInt(req.user.id), BigInt(id), body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() req: { user: { id: bigint } }, @Param('id') id: string) {
    return this.service.remove(BigInt(req.user.id), BigInt(id));
  }
}
