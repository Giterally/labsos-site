import { supabaseServer } from '../../supabase-server';
import { StructuredDocument, Section, ContentBlock } from './pdf-parser';
import { OpenAI } from 'openai';

export interface VideoStructuredDocument extends StructuredDocument {
  type: 'video';
  segments: VideoSegment[];
  transcript: string;
}

export interface VideoSegment {
  startTime: number; // seconds
  endTime: number;
  text: string;
  speaker?: string; // if diarization available
  confidence: number;
  isTopicShift?: boolean; // detected pause/topic change
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Parse video file with Whisper API transcription and segmentation
 */
export async function parseVideo(
  storagePath: string,
  sourceId: string,
  fileName: string
): Promise<VideoStructuredDocument> {
  try {
    // Download video file from storage
    const { data: videoData, error: downloadError } = await supabaseServer.storage
      .from('user-uploads')
      .download(storagePath);

    if (downloadError) {
      throw new Error(`Failed to download video file: ${downloadError.message}`);
    }

    // Convert to File/Blob for Whisper API
    const videoBlob = await videoData.blob();
    const videoFile = new File([videoBlob], fileName, { type: videoBlob.type });

    // Transcribe using Whisper API
    console.log(`[VIDEO_PARSER] Transcribing video with Whisper API...`);
    const transcription = await openai.audio.transcriptions.create({
      file: videoFile,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    console.log(`[VIDEO_PARSER] Transcription complete: ${transcription.segments?.length || 0} segments`);

    // Extract segments with timestamps
    const segments: VideoSegment[] = (transcription.segments || []).map((seg: any) => ({
      startTime: seg.start,
      endTime: seg.end,
      text: seg.text,
      confidence: seg.no_speech_prob ? 1 - seg.no_speech_prob : 0.95,
      isTopicShift: detectTopicShift(seg, transcription.segments),
    }));

    // Create full transcript text
    const transcript = segments.map(s => s.text).join(' ');

    // Segment transcript into sections based on topic shifts
    const sections = createSectionsFromSegments(segments, transcript);

    return {
      type: 'video',
      sourceId,
      fileName,
      sections,
      segments,
      transcript,
      metadata: {
        totalPages: sections.length, // Treat sections as pages
        duration: segments.length > 0 ? segments[segments.length - 1].endTime : 0,
        segmentCount: segments.length,
        processedAt: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error('Video parsing error:', error);
    throw new Error(`Failed to parse video file: ${error.message}`);
  }
}

/**
 * Detect topic shifts in video segments
 */
function detectTopicShift(segment: any, allSegments: any[]): boolean {
  // Check for long pauses (>3 seconds)
  const segmentIndex = allSegments.indexOf(segment);
  if (segmentIndex > 0) {
    const prevSegment = allSegments[segmentIndex - 1];
    const pauseDuration = segment.start - prevSegment.end;
    if (pauseDuration > 3) {
      return true;
    }
  }

  // Check for topic shift phrases
  const topicShiftPhrases = [
    'next step',
    'now we\'ll',
    'after that',
    'moving on',
    'let\'s move',
    'now let\'s',
    'in the next',
    'finally',
    'to summarize',
  ];

  const textLower = segment.text.toLowerCase();
  return topicShiftPhrases.some(phrase => textLower.includes(phrase));
}

/**
 * Create sections from video segments
 */
function createSectionsFromSegments(segments: VideoSegment[], transcript: string): Section[] {
  const sections: Section[] = [];
  let currentSection: Section | null = null;
  let sectionNumber = 1;

  for (const segment of segments) {
    // Start new section on topic shift or every 30 seconds
    if (segment.isTopicShift || 
        (currentSection && 
         segment.startTime - (currentSection.metadata?.startTime || 0) > 30)) {
      
      // Save previous section
      if (currentSection && currentSection.content.length > 0) {
        sections.push(currentSection);
      }

      // Create new section
      currentSection = {
        level: 1,
        title: `Segment ${sectionNumber}`,
        content: [],
        pageRange: [sectionNumber, sectionNumber],
        sectionNumber: String(sectionNumber),
        metadata: {
          startTime: segment.startTime,
          endTime: segment.endTime,
        },
      };
      sectionNumber++;
    }

    if (!currentSection) {
      currentSection = {
        level: 1,
        title: 'Segment 1',
        content: [],
        pageRange: [1, 1],
        sectionNumber: '1',
        metadata: {
          startTime: segment.startTime,
          endTime: segment.endTime,
        },
      };
    }

    // Add segment as content block
    currentSection.content.push({
      type: 'text',
      content: segment.text,
      pageNumber: sectionNumber - 1,
      formatting: {
        // Store timestamp info in formatting
      },
    });

    // Update section end time
    if (currentSection.metadata) {
      currentSection.metadata.endTime = segment.endTime;
    }
    currentSection.pageRange[1] = sectionNumber - 1;
  }

  // Add final section
  if (currentSection && currentSection.content.length > 0) {
    sections.push(currentSection);
  }

  // If no sections created, create one with all content
  if (sections.length === 0) {
    sections.push({
      level: 1,
      title: 'Transcript',
      content: segments.map(seg => ({
        type: 'text' as const,
        content: seg.text,
        pageNumber: 1,
      })),
      pageRange: [1, 1],
    });
  }

  return sections;
}

/**
 * Parse audio file (same as video but without video processing)
 */
export async function parseAudio(
  storagePath: string,
  sourceId: string,
  fileName: string
): Promise<VideoStructuredDocument> {
  // Audio parsing is identical to video parsing
  return parseVideo(storagePath, sourceId, fileName);
}






