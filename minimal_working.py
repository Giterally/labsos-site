#!/usr/bin/env python3
import re

# Read the file
with open('app/page.tsx', 'r') as f:
    content = f.read()

# Add form state after existing useState
form_state = '''  const [formData, setFormData] = useState({
    name: '',
    email: '',
    university: '',
    researchTopic: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState('')'''

# Insert form state after openFAQ state
content = re.sub(
    r'(const \[openFAQ, setOpenFAQ\] = useState<number \| null>\(null\))',
    r'\1' + '\n' + form_state,
    content
)

# Add form submission handler after handleSeeInAction
form_handler = '''
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitMessage('')

    try {
      const response = await fetch('/api/send-demo-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (response.ok) {
        setSubmitMessage('Demo request sent successfully! We\\'ll be in touch soon.')
        setFormData({
          name: '',
          email: '',
          university: '',
          researchTopic: ''
        })
        setTimeout(() => {
          setShowContactForm(false)
          setSubmitMessage('')
        }, 3000)
      } else {
        setSubmitMessage('Failed to send request. Please try again.')
      }
    } catch (error) {
      console.error('Error:', error)
      setSubmitMessage('Failed to send request. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }'''

# Insert form handler after handleSeeInAction
content = re.sub(
    r'(const handleSeeInAction = \(\) => \{[\s\S]*?window\.location\.href = "/login"[\s\S]*?\})',
    r'\1' + form_handler,
    content
)

# Update form tag
content = re.sub(
    r'<form className="space-y-8">',
    '<form onSubmit={handleFormSubmit} className="space-y-8">',
    content
)

# Update only the essential form inputs
content = re.sub(
    r'<Input id="name" placeholder="Dr\. Jane Smith" required className="h-11" />',
    '<Input id="name" placeholder="Dr. Jane Smith" required className="h-11" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />',
    content
)

content = re.sub(
    r'<Input id="email" type="email" placeholder="jane\.smith@university\.edu" required className="h-11" />',
    '<Input id="email" type="email" placeholder="jane.smith@university.edu" required className="h-11" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />',
    content
)

content = re.sub(
    r'<Input id="university" placeholder="University of Cambridge" required className="h-11" />',
    '<Input id="university" placeholder="University of Cambridge" required className="h-11" value={formData.university} onChange={(e) => setFormData({...formData, university: e.target.value})} />',
    content
)

content = re.sub(
    r'<Input id="research-topic" placeholder="Computational Biology, Neuroscience, Chemistry\.\.\." required className="h-11" />',
    '<Input id="research-topic" placeholder="Computational Biology, Neuroscience, Chemistry..." required className="h-11" value={formData.researchTopic} onChange={(e) => setFormData({...formData, researchTopic: e.target.value})} />',
    content
)

# Update submit button
content = re.sub(
    r'<Button type="submit" className="flex-1 h-12 text-base">',
    '<Button type="submit" className="flex-1 h-12 text-base" disabled={isSubmitting}>',
    content
)

content = re.sub(
    r'Schedule Demo',
    '{isSubmitting ? "Sending..." : "Schedule Demo"}',
    content
)

# Add success/error message after form
content = re.sub(
    r'</form>',
    '''</form>
                {submitMessage && (
                  <div className={`mt-4 p-4 rounded-lg ${
                    submitMessage.includes('successfully') 
                      ? 'bg-green-50 text-green-800 border border-green-200' 
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}>
                    {submitMessage}
                  </div>
                )}''',
    content
)

# Write the updated content
with open('app/page.tsx', 'w') as f:
    f.write(content)

print("Form updated successfully!")
