import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  deepgramApiKey: process.env.DEEPGRAM_API_KEY || '',
  port: parseInt(process.env.PORT || '3001', 10),
};
