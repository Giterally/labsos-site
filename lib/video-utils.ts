// Utility functions for video URL detection and embedding

export interface VideoInfo {
  type: 'youtube' | 'vimeo' | 'video_file' | 'not_video'
  embedUrl?: string
  thumbnailUrl?: string
  title?: string
}

export function detectVideoType(url: string): VideoInfo {
  // Clean the URL first
  const cleanUrl = url.trim()
  
  // YouTube detection - handle multiple formats
  const youtubePatterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
    /youtube\.com\/.*[?&]v=([^&\n?#]+)/
  ]
  
  for (const pattern of youtubePatterns) {
    const match = cleanUrl.match(pattern)
    if (match) {
      const videoId = match[1]
      return {
        type: 'youtube',
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        title: 'YouTube Video'
      }
    }
  }

  // Vimeo detection
  const vimeoRegex = /vimeo\.com\/(?:.*#|.*\/videos\/)?([0-9]+)/
  const vimeoMatch = cleanUrl.match(vimeoRegex)
  if (vimeoMatch) {
    const videoId = vimeoMatch[1]
    return {
      type: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${videoId}`,
      thumbnailUrl: `https://vumbnail.com/${videoId}.jpg`,
      title: 'Vimeo Video'
    }
  }

  // Direct video file detection
  const videoFileRegex = /\.(mp4|webm|ogg|avi|mov|wmv|flv|mkv)(\?.*)?$/i
  if (videoFileRegex.test(cleanUrl)) {
    return {
      type: 'video_file',
      embedUrl: cleanUrl,
      title: 'Video File'
    }
  }

  return {
    type: 'not_video'
  }
}

export function isVideoUrl(url: string): boolean {
  const videoInfo = detectVideoType(url)
  return videoInfo.type !== 'not_video'
}

export function getVideoPreviewInfo(url: string): { isValid: boolean; type?: string; message?: string } {
  const videoInfo = detectVideoType(url)
  
  if (videoInfo.type === 'not_video') {
    return {
      isValid: false,
      message: 'Please enter a valid YouTube, Vimeo, or direct video file URL'
    }
  }
  
  return {
    isValid: true,
    type: videoInfo.type,
    message: `Detected ${videoInfo.type} video`
  }
}
