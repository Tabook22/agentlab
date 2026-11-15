import {defineConfig,mergeConfig} from 'vite';
import base from '../vite.config';
export default defineConfig(env=>mergeConfig(base(env),{server:{host:'127.0.0.1',port:5175,strictPort:true,proxy:{'/api':'http://127.0.0.1:8001'}}}));
