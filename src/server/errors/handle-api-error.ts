import { AppError } from "./app-error";

export function toApiError(error: unknown) {
  if (error instanceof AppError) {
    return {
      status: error.statusCode,
      body: {
        success: false as const,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      success: false as const,
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
    },
  };
}
