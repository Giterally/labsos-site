'use client';

import { useUser } from '@/lib/user-context';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import TodoList from '@/components/activity-tracker/todos/TodoList';
import WorkLogList from '@/components/activity-tracker/work-logs/WorkLogList';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function TasksPageContent() {
  const { user, loading } = useUser();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>('tasks');

  // Read tab from URL on mount
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'logs' || tab === 'tasks') {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', value);
    router.push(`/dashboard/tasks?${params.toString()}`, { scroll: false });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">Please log in to view your tasks.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Tasks & Work Logs</h1>
          <p className="text-muted-foreground">
            Manage your tasks and track your work progress
          </p>
        </div>

        <div className="rounded-xl border bg-muted/40 p-4 md:p-6">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="logs">Work Logs</TabsTrigger>
            </TabsList>

            <TabsContent value="tasks" className="mt-0">
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">
                  Track actionable items with personal tasks or share them with collaborators. Tasks help organize work, assign responsibilities, and coordinate research activities.
                </p>
              </div>
              <TodoList />
            </TabsContent>

            <TabsContent value="logs" className="mt-0">
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">
                  Document your daily progress, meeting notes, and research activities. Work logs create a timeline of your contributions to projects and help maintain research continuity.
                </p>
              </div>
              <WorkLogList />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <TasksPageContent />
    </Suspense>
  );
}

