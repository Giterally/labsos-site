-- Migration: Identify chunks with mixed embedding providers
-- This query helps identify projects that may have mixed OpenAI/Claude embeddings

-- Query to find chunks with different embedding models
SELECT 
    p.id as project_id,
    p.name as project_name,
    c.metadata->>'embeddingModel' as embedding_model,
    COUNT(*) as chunk_count,
    array_length(c.embedding, 1) as embedding_dimension
FROM chunks c
JOIN projects p ON c.project_id = p.id
WHERE c.embedding IS NOT NULL
GROUP BY p.id, p.name, c.metadata->>'embeddingModel', array_length(c.embedding, 1)
ORDER BY p.name, embedding_model;

-- Query to find projects with mixed embedding models
WITH project_embedding_stats AS (
    SELECT 
        p.id as project_id,
        p.name as project_name,
        COUNT(DISTINCT c.metadata->>'embeddingModel') as model_count,
        COUNT(DISTINCT array_length(c.embedding, 1)) as dimension_count,
        array_agg(DISTINCT c.metadata->>'embeddingModel') as models_used,
        array_agg(DISTINCT array_length(c.embedding, 1)) as dimensions_used,
        COUNT(*) as total_chunks
    FROM chunks c
    JOIN projects p ON c.project_id = p.id
    WHERE c.embedding IS NOT NULL
    GROUP BY p.id, p.name
)
SELECT 
    project_id,
    project_name,
    model_count,
    dimension_count,
    models_used,
    dimensions_used,
    total_chunks,
    CASE 
        WHEN model_count > 1 OR dimension_count > 1 THEN 'MIXED_EMBEDDINGS'
        ELSE 'CONSISTENT_EMBEDDINGS'
    END as status
FROM project_embedding_stats
ORDER BY 
    CASE 
        WHEN model_count > 1 OR dimension_count > 1 THEN 0
        ELSE 1
    END,
    project_name;

-- Query to find chunks that need regeneration (Claude embeddings)
SELECT 
    p.id as project_id,
    p.name as project_name,
    c.id as chunk_id,
    c.metadata->>'embeddingModel' as embedding_model,
    array_length(c.embedding, 1) as embedding_dimension,
    c.created_at
FROM chunks c
JOIN projects p ON c.project_id = p.id
WHERE c.embedding IS NOT NULL
  AND (c.metadata->>'embeddingModel' = 'claude-3-haiku-20240307' 
       OR c.metadata->>'embeddingModel' IS NULL)
ORDER BY p.name, c.created_at;
