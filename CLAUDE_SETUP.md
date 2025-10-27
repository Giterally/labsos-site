# Claude API Setup Guide

## 🎉 **Claude Integration Complete!**

Your Experiment-Tree Auto-Builder now supports Claude as the primary AI provider for text generation, with OpenAI still handling embeddings.

## 🔧 **Setup Instructions**

### 1. **Create `.env.local` File**

Create a `.env.local` file in your project root with:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# AI Provider Configuration
AI_PROVIDER=claude
ANTHROPIC_API_KEY=your-anthropic-api-key-here

# OpenAI Configuration (still needed for embeddings)
OPENAI_API_KEY=sk-your-openai-api-key-here
```

### 2. **Add OpenAI Credits (For Embeddings)**

Since Claude doesn't have an embeddings API, you still need a small amount of OpenAI credits for embeddings:

- Go to: https://platform.openai.com/account/billing
- Add $5-10 for embeddings (much cheaper than text generation)
- Embeddings cost ~$0.00002 per 1K tokens

### 3. **Restart Development Server**

```bash
pnpm dev
```

## 💰 **Cost Comparison**

| Task | Claude (Your Key) | OpenAI (Embeddings Only) |
|------|------------------|---------------------------|
| **Node Synthesis** | ✅ Free with your credits | ❌ Not used |
| **Text Generation** | ✅ Free with your credits | ❌ Not used |
| **Embeddings** | ❌ Not available | ✅ ~$0.00002/1K tokens |

**Total Cost**: Only need small OpenAI credits for embeddings (~$0.01-0.05 for testing)

## 🚀 **How It Works**

1. **Claude** handles all text generation and node synthesis
2. **OpenAI** handles embeddings (vector representations)
3. **Hybrid approach** gives you the best of both worlds

## 🎯 **What's Different**

- **Better text quality**: Claude excels at research protocol synthesis
- **Lower costs**: Your Claude credits vs. OpenAI pricing
- **Same workflow**: Upload → AI Processing → Review → Build Tree

## 🔍 **Testing**

1. Upload a text file to your RNA-seq project
2. Check the terminal for processing logs
3. Go to "Build Tree" tab → "Review Proposals"
4. See Claude-generated experiment nodes!

## 🛠 **Troubleshooting**

If you see errors:
1. Make sure `.env.local` has your actual Supabase credentials
2. Ensure you have small OpenAI credits for embeddings
3. Restart the dev server after adding environment variables

Your Claude API key is ready to power the AI experiment tree generation! 🎉
