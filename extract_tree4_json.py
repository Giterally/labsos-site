#!/usr/bin/env python3
"""
Extract and save the complete Tree 4 JSON from Supabase query result
"""
import json
import glob
import os

# Find the most recent agent-tools file
agent_tools_dir = os.path.expanduser('~/.cursor/projects/Users-noahchander-Downloads-LabsOS-LabsOS-postMoazan/agent-tools')
if not os.path.exists(agent_tools_dir):
    # Try alternative path
    agent_tools_dir = os.path.expanduser('~/.cursor/projects/*/agent-tools')
    dirs = glob.glob(agent_tools_dir)
    if dirs:
        agent_tools_dir = dirs[0]

# Find the most recent file (should be the JSON query result)
if os.path.exists(agent_tools_dir):
    files = glob.glob(os.path.join(agent_tools_dir, '*.txt'))
    if files:
        # Get most recent
        latest_file = max(files, key=os.path.getmtime)
        print(f"Reading from: {latest_file}")
        
        with open(latest_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Extract JSON - look for the tree_json_text field or the JSON object
        # The content should have the JSON somewhere
        start = content.find('"tree_json_text"')
        if start != -1:
            # Find the JSON value
            start = content.find('{', start)
            # Find matching closing brace (this is tricky, but let's try)
            # Actually, let's look for the pattern
            pass
        
        # Try to find JSON array or object
        start = content.find('{')
        end = content.rfind('}') + 1
        
        if start >= 0 and end > start:
            json_str = content[start:end]
            try:
                data = json.loads(json_str)
                # If it's wrapped in a list or has tree_json_text field
                if isinstance(data, list) and len(data) > 0:
                    if 'tree_json_text' in data[0]:
                        # Parse the JSON string inside
                        tree_json = json.loads(data[0]['tree_json_text'])
                    else:
                        tree_json = data[0]
                elif 'tree_json_text' in data:
                    tree_json = json.loads(data['tree_json_text'])
                else:
                    tree_json = data
                
                # Write to file
                output_file = 'tree4_precision_recall_full.json'
                with open(output_file, 'w', encoding='utf-8') as f:
                    json.dump(tree_json, f, indent=2, ensure_ascii=False)
                
                nodes_count = len(tree_json.get('nodes', []))
                print(f"✅ Created complete JSON file: {output_file}")
                print(f"   - {nodes_count} nodes")
                print(f"   - {len(tree_json.get('blocks', []))} blocks")
                if 'summary' in tree_json:
                    print(f"   - {tree_json['summary'].get('total_dependencies', 0)} dependencies")
                    print(f"   - {tree_json['summary'].get('total_attachments', 0)} attachments")
                
            except json.JSONDecodeError as e:
                print(f"❌ JSON parse error: {e}")
                print(f"   Trying to extract from content...")
                # Try to find the JSON more carefully
                # Look for the actual JSON structure
                import re
                # Match JSON object
                match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', content, re.DOTALL)
                if match:
                    try:
                        tree_json = json.loads(match.group(0))
                        output_file = 'tree4_precision_recall_full.json'
                        with open(output_file, 'w', encoding='utf-8') as f:
                            json.dump(tree_json, f, indent=2, ensure_ascii=False)
                        print(f"✅ Created JSON file from regex match: {output_file}")
                    except:
                        print("❌ Still failed to parse")
                else:
                    print("❌ Could not find JSON structure")
        else:
            print("❌ Could not find JSON boundaries in file")
    else:
        print(f"❌ No .txt files found in {agent_tools_dir}")
else:
    print(f"❌ Agent tools directory not found: {agent_tools_dir}")
    print("   Please run the Supabase query manually and save the result")

