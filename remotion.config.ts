import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// 9:16 숏폼 — H.264 mp4 (YouTube Shorts 호환)
Config.setCodec('h264');
Config.setConcurrency(2);
