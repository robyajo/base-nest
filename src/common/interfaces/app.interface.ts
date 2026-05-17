import { UserRole } from "generated/prisma/enums";

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface RequestWithUser extends Request {
  user: JwtPayload;
}
