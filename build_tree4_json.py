#!/usr/bin/env python3
"""
Build complete JSON for Tree 4: [Precision-Recall and ROC Curves Analysis]
"""
import json
import sys

# Tree ID
TREE_ID = "cbce1155-abdf-4ed8-9f73-502fe47f0bce"

# We'll query the database via SQL and build the JSON
# For now, let's use the data structure we know

print("Building complete JSON for Tree 4...")
print("This will query the database and build the full JSON structure.")

# The file will be created by querying Supabase directly
# Since we can't easily parse the large files, let's create a script that
# uses the Supabase MCP to get the data

print("\nTo build the complete JSON, please run this query in Supabase:")
print(f"""
SELECT 
  json_build_object(
    'tree', json_build_object(
      'id', et.id,
      'name', et.name,
      'description', et.description,
      'status', et.status,
      'node_count', et.node_count,
      'created_at', et.created_at
    ),
    'blocks', (SELECT json_agg(json_build_object(
      'id', tb.id,
      'name', tb.name,
      'description', tb.description,
      'position', tb.position,
      'block_type', tb.block_type
    ) ORDER BY tb.position) FROM tree_blocks tb WHERE tb.tree_id = et.id),
    'nodes', (SELECT json_agg(
      json_build_object(
        'id', tn.id,
        'name', tn.name,
        'description', tn.description,
        'node_type', tn.node_type,
        'position', tn.position,
        'status', tn.status,
        'confidence', tn.confidence::text,
        'block_id', tn.block_id,
        'block_name', tb2.name,
        'content', COALESCE(nc.content, ''),
        'provenance', COALESCE(tn.provenance, '{}'::jsonb),
        'attachments', (SELECT json_agg(json_build_object(
          'id', na.id,
          'name', na.name,
          'description', na.description,
          'file_type', na.file_type,
          'file_url', na.file_url
        )) FROM node_attachments na WHERE na.node_id = tn.id),
        'links', (SELECT json_agg(json_build_object(
          'id', nl.id,
          'name', nl.name,
          'url', nl.url,
          'description', nl.description,
          'link_type', nl.link_type
        )) FROM node_links nl WHERE nl.node_id = tn.id),
        'dependencies', (SELECT json_agg(json_build_object(
          'id', nd.id,
          'to_node_id', nd.to_node_id,
          'to_node_name', tn2.name,
          'dependency_type', nd.dependency_type,
          'evidence_text', nd.evidence_text,
          'confidence', nd.confidence::text
        )) FROM node_dependencies nd
        JOIN tree_nodes tn2 ON nd.to_node_id = tn2.id
        WHERE nd.from_node_id = tn.id)
      ) ORDER BY tb2.position, tn.position
    ) FROM tree_nodes tn
    JOIN tree_blocks tb2 ON tn.block_id = tb2.id
    LEFT JOIN node_content nc ON tn.id = nc.node_id
    WHERE tn.tree_id = et.id)
  )
FROM experiment_trees et
WHERE et.id = '{TREE_ID}';
""")

print("\nAlternatively, I can create a Node.js script to use the Supabase client.")
print("For now, creating a template structure...")

# Create a basic structure
tree_json = {
    "tree": {
        "id": TREE_ID,
        "name": "[Precision-Recall and ROC Curves Analysis]",
        "description": "Experiment tree generated from uploaded files",
        "status": "draft",
        "node_count": 0,
        "created_at": "2025-11-06T17:00:15.124054Z"
    },
    "blocks": [
        {
            "id": "01245a76-e913-4f82-9b99-e234d7865cbb",
            "name": "Protocol Block",
            "description": "Block containing protocol nodes",
            "position": 1,
            "block_type": "custom"
        },
        {
            "id": "e1bc98f1-949e-4ae2-b747-8ae8b27e720e",
            "name": "Data Creation Block",
            "description": "Block containing data_creation nodes",
            "position": 2,
            "block_type": "custom"
        },
        {
            "id": "82458c41-60ab-4a24-a084-34d6fcf5487a",
            "name": "Analysis Block",
            "description": "Block containing analysis nodes",
            "position": 3,
            "block_type": "custom"
        },
        {
            "id": "fc703475-33bd-4d70-a7de-8c43f0cf54d3",
            "name": "Results Block",
            "description": "Block containing results nodes",
            "position": 4,
            "block_type": "custom"
        }
    ],
    "nodes": [],
    "summary": {
        "total_nodes": 62,
        "total_blocks": 4,
        "total_dependencies": 28,
        "total_attachments": 1,
        "total_links": 0,
        "nodes_by_type": {
            "protocol": 23,
            "data_creation": 10,
            "analysis": 19,
            "results": 10
        },
        "nodes_by_block": {
            "Protocol Block": 23,
            "Data Creation Block": 10,
            "Analysis Block": 19,
            "Results Block": 10
        }
    }
}

# Write template
with open('tree4_precision_recall_full.json', 'w', encoding='utf-8') as f:
    json.dump(tree_json, f, indent=2, ensure_ascii=False)

print(f"\n✅ Created template JSON file: tree4_precision_recall_full.json")
print("   Note: This is a template. The full JSON with all 62 nodes needs to be")
print("   generated from the database. Use the SQL query above or the Supabase MCP tool.")

