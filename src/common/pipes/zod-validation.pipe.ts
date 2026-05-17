import { PipeTransform, BadRequestException } from '@nestjs/common';
import { ZodSchema } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const field = issue.path.join('.') || '_root';
        if (!errors[field]) errors[field] = [];
        errors[field].push(issue.message);
      }
      throw new BadRequestException({ errors });
    }
    return result.data;
  }
}
