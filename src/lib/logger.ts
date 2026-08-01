import pino from 'pino';

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  /**
   * Without serializers pino writes a bare Error as `{}`, because message and
   * stack are non-enumerable. Production logs were full of `"error":{}` lines
   * that named the failing URL but not the failure, which made a hard timeout
   * indistinguishable from a parse bug.
   *
   * pino serializes a key named `err` by default; most of this codebase logs
   * `error`, so map both.
   */
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  transport: process.env.NODE_ENV !== 'production' 
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      } 
    : undefined,
});

export default logger;
