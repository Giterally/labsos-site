import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import { join } from 'path'
 
export const size = {
  width: 512,
  height: 512,
}
export const contentType = 'image/png'
 
export default async function Icon() {
  try {
    // Read the logo from the public directory
    const logoPath = join(process.cwd(), 'public', 'olvaro-fin copy.png')
    const logoBuffer = await readFile(logoPath)
    const logoBase64 = logoBuffer.toString('base64')

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
          }}
        >
          <img
            src={`data:image/png;base64,${logoBase64}`}
            alt="Olvaro Logo"
            style={{
              width: '250%',
              height: '250%',
              objectFit: 'contain',
            }}
          />
        </div>
      ),
      {
        ...size,
      }
    )
  } catch (error) {
    // Fallback if image can't be loaded
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
            fontSize: 128,
          }}
        >
          🌲
        </div>
      ),
      {
        ...size,
      }
    )
  }
}

