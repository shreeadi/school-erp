import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';

/** Translates common Prisma errors into HTTP errors with safe messages. */
export function mapPrismaError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') throw new ConflictException('A record with these details already exists');
    if (err.code === 'P2025') throw new NotFoundException('Record not found');
    if (err.code === 'P2003') throw new BadRequestException('A referenced record does not exist in this school');
  }
  throw err;
}

export async function guardPrisma<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    mapPrismaError(err);
  }
}
