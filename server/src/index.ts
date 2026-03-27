import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import { config } from './config';
import meetingsRouter from './routes/meetings';
import { handleConnection } from './ws/handler';

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use('/api', meetingsRouter);

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', handleConnection);

server.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
  console.log(`WebSocket available at ws://localhost:${config.port}/ws`);
});
