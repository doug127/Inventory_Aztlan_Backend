import dotenv from 'dotenv';
dotenv.config();

import cors from 'cors';
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import routes from './routes/index.js';
import { runServer } from './server.js';

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

app.use(session({
  name: 'inventory.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use('/api', routes);

runServer(app);

export default app;
