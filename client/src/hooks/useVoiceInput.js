import { useEffect, useRef, useState } from 'react';
import { voiceApi } from '../services/endpoints.js';

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function mergeTranscript(baseText, transcript) {
  const cleanBase = String(baseText || '').trimEnd();
  const cleanTranscript = String(transcript || '').trim();
  if (!cleanTranscript) return baseText;
  return cleanBase ? `${cleanBase} ${cleanTranscript}` : cleanTranscript;
}

export function useVoiceInput({ text, setText }) {
  const supported = Boolean(getSpeechRecognition());
  const [isListening, setIsListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('');
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordingTimeoutRef = useRef(null);
  const baseTextRef = useRef('');
  const finalTranscriptRef = useRef('');
  const heardSpeechRef = useRef(false);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    };
  }, []);

  const stopListening = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      return;
    }
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const stopMediaStream = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const startAudioRecordingFallback = async () => {
    if (!window.MediaRecorder) {
      setIsListening(false);
      setVoiceMessage('Audio recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      setIsListening(true);
      setVoiceMessage('Recording voice input. Click the mic again to stop.');

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };

      recorder.onstop = async () => {
        if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
        mediaRecorderRef.current = null;
        stopMediaStream();
        setIsListening(false);

        const audioBlob = new Blob(chunks, { type: mimeType });
        if (!audioBlob.size) {
          setVoiceMessage('');
          return;
        }

        try {
          setVoiceMessage('Transcribing voice input...');
          const { text: transcript } = await voiceApi.transcribe(audioBlob);
          if (transcript?.trim()) {
            setText(mergeTranscript(baseTextRef.current, transcript));
            setVoiceMessage('');
          } else {
            setVoiceMessage('No speech was detected. You can still type your prompt.');
          }
        } catch (error) {
          setVoiceMessage(
            error?.response?.data?.error?.message
              || 'Voice transcription is unavailable right now. You can still type your prompt.'
          );
        }
      };

      recorder.start();
      recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 15000);
    } catch (error) {
      setIsListening(false);
      if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
        setVoiceMessage('Microphone permission was denied. You can still type your prompt.');
      } else if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
        setVoiceMessage('No microphone was found. You can still type your prompt.');
      } else {
        setVoiceMessage('Microphone recording could not start. You can still type your prompt.');
      }
    }
  };

  const startListening = async () => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setVoiceMessage('Voice input is not supported in this browser.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceMessage('Microphone access is not available in this browser.');
      return;
    }

    setVoiceMessage('');
    setIsListening(true);
    baseTextRef.current = text;
    finalTranscriptRef.current = '';
    heardSpeechRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      setIsListening(false);
      if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
        setVoiceMessage('Microphone permission was denied. You can still type your prompt.');
      } else if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
        setVoiceMessage('No microphone was found. You can still type your prompt.');
      } else {
        setVoiceMessage('Microphone access could not start. You can still type your prompt.');
      }
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript || '';
        if (transcript.trim()) heardSpeechRef.current = true;
        if (result.isFinal) {
          finalTranscriptRef.current = mergeTranscript(finalTranscriptRef.current, transcript);
        } else {
          interimTranscript = mergeTranscript(interimTranscript, transcript);
        }
      }

      const liveTranscript = mergeTranscript(finalTranscriptRef.current, interimTranscript);
      setText(mergeTranscript(baseTextRef.current, liveTranscript));
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setVoiceMessage('Microphone permission was denied. You can still type your prompt.');
      } else if (event.error === 'audio-capture') {
        setVoiceMessage('No microphone was found. You can still type your prompt.');
      } else if (event.error === 'network' && !heardSpeechRef.current) {
        startAudioRecordingFallback();
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch {
      setIsListening(false);
      setVoiceMessage('Voice input could not start. You can still type your prompt.');
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return {
    isListening,
    isVoiceSupported: supported,
    voiceMessage,
    toggleListening,
  };
}
