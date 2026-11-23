import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class LoginDto {
  @ApiProperty({ example: 'GREENWOOD', description: 'School login code issued by the platform' })
  @Transform(upper)
  @Matches(/^[A-Z0-9]{3,16}$/)
  schoolCode: string;

  @ApiProperty({ example: 'admin@greenwood.demo' })
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'Demo@12345' })
  @IsString()
  @Length(1, 128)
  password: string;
}

export class PlatformLoginDto {
  @ApiProperty({ example: 'superadmin@school-erp.demo' })
  @Transform(lower)
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @Length(1, 128)
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @Length(1, 128)
  currentPassword: string;

  @ApiProperty({ description: 'At least 10 characters, including a letter and a digit' })
  @IsString()
  @Length(10, 128)
  newPassword: string;
}
