import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

/**
 * Password hashing. Uses bcrypt (pure-JS implementation — no native build step,
 * so it is identical across local dev, CI, and the container image).
 */
@Injectable()
export class PasswordService {
  private readonly saltRounds = 12;

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.saltRounds);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
