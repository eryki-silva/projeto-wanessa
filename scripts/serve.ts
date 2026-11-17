import express from 'express';
import {fileURLToPath} from 'node:url';
import app from '../backend/app';
const dist=fileURLToPath(new URL('../dist/',import.meta.url));
app.use(express.static(dist));
app.listen(4173,'127.0.0.1',()=>console.log('Compasso: http://127.0.0.1:4173'));
