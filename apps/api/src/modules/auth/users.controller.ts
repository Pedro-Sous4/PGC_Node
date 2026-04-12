import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from './application/users.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class UsersController {
    constructor(private readonly service: UsersService) {}

    @Post()
    create(@Body() dto: any) {
      return this.service.create(dto);
    }

    @Get()
  listAll() {
    return this.service.listAll();
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('active') active: boolean) {
    return this.service.updateStatus(id, active);
  }

  @Patch(':id/role')
  updateRole(@Param('id') id: string, @Body('role') role: Role) {
    return this.service.updateRole(id, role);
  }

  @Delete(':id')
  deleteUser(@Param('id') id: string) {
    return this.service.deleteUser(id);
  }
}
