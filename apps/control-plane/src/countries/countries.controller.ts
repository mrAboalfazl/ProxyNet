import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CountriesService } from './countries.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('countries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('countries')
export class CountriesController {
  constructor(private countries: CountriesService) {}

  @Get()
  findAll() {
    return this.countries.findAll();
  }

  @Get('status')
  getStatus() {
    return this.countries.getPoolStatus();
  }
}
