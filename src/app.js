import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import routes from './shared/routes/index.route.js';
import { requestId } from './shared/middlewares/requestId.middleware.js';
import { requestLogger } from './shared/middlewares/requestLogger.middleware.js';
import { notFound } from './shared/middlewares/notFound.middleware.js';
import { errorHandler } from './shared/middlewares/errorHandler.middleware.js';

// Solo construye la aplicación Express; el arranque (BD + listen) está en server.js.
const app = express();

app.use(requestId);
app.use(requestLogger);
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  // Content-Disposition: el nombre de los archivos exportados (HU-503).
  exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use(session({
  name: 'inventory.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler); // siempre el último

export default app;
