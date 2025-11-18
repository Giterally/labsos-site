'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useUser } from '@/lib/user-context';
import { TodoMeetingUpdate } from '@/types/activity-tracker';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Edit, Trash2, Plus, Save, X } from 'lucide-react';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';

interface TodoMeetingUpdatesProps {
  todoId: string;
  isRecurringMeeting: boolean;
}

export default function TodoMeetingUpdates({ todoId, isRecurringMeeting }: TodoMeetingUpdatesProps) {
  const { user } = useUser();
  const [updates, setUpdates] = useState<TodoMeetingUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUpdateContent, setNewUpdateContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  useEffect(() => {
    if (isRecurringMeeting) {
      fetchUpdates();
    }
  }, [todoId, isRecurringMeeting]);

  const fetchUpdates = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/todos/${todoId}/meeting-updates`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUpdates(data.updates || []);
      }
    } catch (error) {
      console.error('Error fetching meeting updates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUpdate = async () => {
    if (!newUpdateContent.trim()) return;

    try {
      setSaving(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/todos/${todoId}/meeting-updates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ content: newUpdateContent }),
      });

      if (response.ok) {
        setNewUpdateContent('');
        setShowAddForm(false);
        fetchUpdates();
      } else {
        const data = await response.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error adding meeting update:', error);
      alert('Error adding update');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (update: TodoMeetingUpdate) => {
    setEditingId(update.id);
    setEditingContent(update.content);
  };

  const handleSaveEdit = async (updateId: string) => {
    if (!editingContent.trim()) return;

    try {
      setSaving(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/todos/${todoId}/meeting-updates/${updateId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ content: editingContent }),
      });

      if (response.ok) {
        setEditingId(null);
        setEditingContent('');
        fetchUpdates();
      } else {
        const data = await response.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error updating meeting update:', error);
      alert('Error updating');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (updateId: string) => {
    if (!confirm('Are you sure you want to delete this update?')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/todos/${todoId}/meeting-updates/${updateId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        fetchUpdates();
      } else {
        const data = await response.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error deleting meeting update:', error);
      alert('Error deleting');
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // For now, allow editing if user is logged in (access control is handled by API)
  // In the future, we could check membership here for better UX
  const canEdit = () => {
    return !!user;
  };

  if (!isRecurringMeeting) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Meeting Updates</h3>
        {!showAddForm && (
          <Button
            size="sm"
            onClick={() => setShowAddForm(true)}
            variant="outline"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Update
          </Button>
        )}
      </div>

      {showAddForm && (
        <div className="border rounded-lg p-4 space-y-3">
          <Textarea
            placeholder="Add a new update or note from this meeting..."
            value={newUpdateContent}
            onChange={(e) => setNewUpdateContent(e.target.value)}
            rows={4}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAddForm(false);
                setNewUpdateContent('');
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAddUpdate}
              disabled={saving || !newUpdateContent.trim()}
            >
              {saving ? 'Saving...' : 'Add Update'}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading updates...</p>
      ) : updates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No updates yet. Add the first update above.</p>
      ) : (
        <div className="space-y-4">
          {updates.map((update, index) => (
            <div key={update.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={update.created_by_profile?.avatar_url || undefined} />
                    <AvatarFallback>
                      {getInitials(update.created_by_profile?.full_name || null)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">
                      {update.created_by_profile?.full_name || 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(update.created_at), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                </div>
                {canEdit() && editingId !== update.id && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleStartEdit(update)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(update.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                )}
              </div>

              {editingId === update.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    rows={4}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingId(null);
                        setEditingContent('');
                      }}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSaveEdit(update.id)}
                      disabled={saving || !editingContent.trim()}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{update.content}</ReactMarkdown>
                </div>
              )}

              {update.updated_at !== update.created_at && (
                <p className="text-xs text-muted-foreground">
                  Edited {format(new Date(update.updated_at), 'MMM d, yyyy h:mm a')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

