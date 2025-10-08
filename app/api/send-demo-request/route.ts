import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const {
      name,
      title,
      email,
      university,
      department,
      researchTopic,
      labSize,
      grantFunder,
      currentTools,
      demoFocus
    } = body

    // Validate required fields
    if (!name || !email || !university || !researchTopic) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Log the received data for debugging
    console.log('Received form data:', body)
    
    // Send email using Resend
    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev', // Use verified Resend domain
      to: ['noahwchander@gmail.com'],
      subject: `New Demo Request from ${name} at ${university}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">New Olvaro Demo Request</h2>
          
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1e293b; margin-top: 0;">Contact Information</h3>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Title/Position:</strong> ${title || 'Not specified'}</p>
            <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          </div>

          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1e293b; margin-top: 0;">Institution & Research</h3>
            <p><strong>University/Institution:</strong> ${university}</p>
            <p><strong>Department/Lab:</strong> ${department || 'Not specified'}</p>
            <p><strong>Research Topic/Field:</strong> ${researchTopic}</p>
          </div>

          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1e293b; margin-top: 0;">Lab Details</h3>
            <p><strong>Lab Size:</strong> ${labSize || 'Not specified'}</p>
            <p><strong>Primary Grant Funder:</strong> ${grantFunder || 'Not specified'}</p>
          </div>

          ${currentTools ? `
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1e293b; margin-top: 0;">Current Tools & Challenges</h3>
            <p style="white-space: pre-wrap;">${currentTools}</p>
          </div>
          ` : ''}

          ${demoFocus ? `
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1e293b; margin-top: 0;">Demo Preferences</h3>
            <p style="white-space: pre-wrap;">${demoFocus}</p>
          </div>
          ` : ''}

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
            <p style="color: #64748b; font-size: 14px;">
              This demo request was submitted from the Olvaro landing page.
            </p>
          </div>
        </div>
      `,
    })

    if (error) {
      console.error('Resend error:', error)
      return NextResponse.json(
        { error: `Failed to send email: ${error.message || 'Unknown error'}` },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { message: 'Demo request sent successfully', id: data?.id },
      { status: 200 }
    )

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
