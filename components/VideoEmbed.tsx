"use client"

import { detectVideoType, VideoInfo } from "@/lib/video-utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowTopRightOnSquareIcon, PlayIcon } from "@heroicons/react/24/outline"
import { useState } from "react"

interface VideoEmbedProps {
  url: string
  title?: string
  type?: string
  className?: string
}

export default function VideoEmbed({ url, title, type, className }: VideoEmbedProps) {
  const [showEmbed, setShowEmbed] = useState(false)
  const videoInfo = detectVideoType(url)

  if (videoInfo.type === 'not_video') {
    return null
  }

  const handlePlayClick = () => {
    setShowEmbed(true)
  }

  const handleExternalClick = () => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const renderVideoEmbed = () => {
    if (videoInfo.type === 'youtube' || videoInfo.type === 'vimeo') {
      return (
        <iframe
          src={videoInfo.embedUrl}
          title={videoInfo.title}
          className="w-full aspect-video rounded-lg"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )
    }

    if (videoInfo.type === 'video_file') {
      return (
        <video
          src={videoInfo.embedUrl}
          controls
          className="w-full aspect-video rounded-lg"
          preload="metadata"
        >
          Your browser does not support the video tag.
        </video>
      )
    }

    return null
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <PlayIcon className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">
              {title || videoInfo.title || 'Video'}
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {type || videoInfo.type}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExternalClick}
            className="h-6 w-6 p-0"
          >
            <ArrowTopRightOnSquareIcon className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {showEmbed ? (
          <div className="space-y-2">
            {renderVideoEmbed()}
            <div className="text-xs text-muted-foreground text-center">
              Click the external link icon to open in a new tab
            </div>
          </div>
        ) : (
          <div className="relative">
            {/* Thumbnail preview */}
            <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors"
                 onClick={handlePlayClick}>
              {videoInfo.thumbnailUrl ? (
                <div className="relative w-full h-full">
                  <img
                    src={videoInfo.thumbnailUrl}
                    alt={title || 'Video thumbnail'}
                    className="w-full h-full object-cover rounded-lg"
                    onError={(e) => {
                      // Fallback to play button if thumbnail fails to load
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
                    <div className="bg-white/90 rounded-full p-3">
                      <PlayIcon className="h-6 w-6 text-black" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="bg-white/90 rounded-full p-4 mb-2">
                    <PlayIcon className="h-8 w-8 text-black" />
                  </div>
                  <p className="text-sm text-muted-foreground">Click to play video</p>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
