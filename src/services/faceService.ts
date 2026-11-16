import * as faceapi from '@vladmandic/face-api';
import { computeFaceMatchScore } from '../utils/attendanceLogic';

let modelsLoaded = false;
let loadingPromise: Promise<void> | null = null;
const descriptorCache = new Map<string, Float32Array>();

export async function ensureFaceModelsLoaded(): Promise<void> {
  if (modelsLoaded) return;
  if (!loadingPromise) {
    loadingPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
    ]).then(() => {
      modelsLoaded = true;
    });
  }
  return loadingPromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Rasmni yuklab bo‘lmadi'));
    img.src = src;
  });
}

export async function getReferenceDescriptor(photoUrl: string): Promise<Float32Array> {
  const cached = descriptorCache.get(photoUrl);
  if (cached) return cached;

  await ensureFaceModelsLoaded();
  const img = await loadImage(photoUrl);
  const detection = await faceapi
    .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 }))
    .withFaceLandmarks(true)
    .withFaceDescriptor();

  if (!detection) {
    throw new Error('Namuna rasmda yuz aniqlanmadi. Iltimos, aniq oldindan olingan rasm yuklang.');
  }

  descriptorCache.set(photoUrl, detection.descriptor);
  return detection.descriptor;
}

export interface FaceVerificationOutcome {
  detected: boolean;
  matched: boolean;
  similarityPercent: number;
  distance: number;
  box?: { x: number; y: number; width: number; height: number };
  error?: string;
}

export async function verifyFaceFrameAgainstPhoto(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  referencePhotoUrl: string
): Promise<FaceVerificationOutcome> {
  await ensureFaceModelsLoaded();
  const referenceDescriptor = await getReferenceDescriptor(referencePhotoUrl);

  const detection = await faceapi
    .detectSingleFace(
      input,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 })
    )
    .withFaceLandmarks(true)
    .withFaceDescriptor();

  if (!detection) {
    return {
      detected: false,
      matched: false,
      similarityPercent: 0,
      distance: 1.5,
      error: 'Kamerada yuz ko‘rinmayapti. Yuzingizni ramka markaziga tuting.',
    };
  }

  const distance = faceapi.euclideanDistance(referenceDescriptor, detection.descriptor);
  const score = computeFaceMatchScore(distance);

  return {
    detected: true,
    matched: score.matched,
    similarityPercent: score.similarityPercent,
    distance: score.distance,
    box: {
      x: detection.detection.box.x,
      y: detection.detection.box.y,
      width: detection.detection.box.width,
      height: detection.detection.box.height,
    },
  };
}
