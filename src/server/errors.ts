export class AppError extends Error {
  constructor(
    public readonly category: string,
    public readonly status = 400,
  ) {
    super(category)
  }
}
