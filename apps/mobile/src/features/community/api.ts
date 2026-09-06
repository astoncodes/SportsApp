import type { Tables } from '@dropin/database-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';

type RunSession = Tables<'run_sessions'>;
type SessionPost = Tables<'session_posts'>;
type SessionMedia = Tables<'session_media'>;
type SessionMessage = Tables<'session_messages'>;

export type FeedPost = SessionPost & {
  authorName: string;
  media: (SessionMedia & { url: string })[];
  session: RunSession;
  sessionTitle: string;
  venueName: string;
  sportName: string;
  sportSlug: string;
};

export type JoinedSession = RunSession & {
  title: string;
  venueName: string;
  sportName: string;
  sportSlug: string;
  lastMessage: SessionMessage | null;
};

function publicMediaUrl(item: SessionMedia) {
  if (item.remote_url) return item.remote_url;
  return supabase.storage.from('session-media').getPublicUrl(item.storage_path!).data.publicUrl;
}

async function sessionLabels(sessions: RunSession[]) {
  const seriesIds = [...new Set(sessions.map((item) => item.run_series_id))];
  const venueIds = [...new Set(sessions.map((item) => item.venue_id))];
  const sportIds = [...new Set(sessions.map((item) => item.sport_id))];
  const [series, venues, sports] = await Promise.all([
    supabase.from('run_series').select('id,title').in('id', seriesIds),
    supabase.from('venues').select('id,name').in('id', venueIds),
    supabase.from('sports').select('id,name,slug').in('id', sportIds),
  ]);
  if (series.error) throw series.error;
  if (venues.error) throw venues.error;
  if (sports.error) throw sports.error;

  return {
    series: new Map((series.data ?? []).map((item) => [item.id, item.title])),
    venues: new Map((venues.data ?? []).map((item) => [item.id, item.name])),
    sports: new Map((sports.data ?? []).map((item) => [item.id, item])),
  };
}

export function useCommunityFeed(regionId?: number) {
  return useQuery({
    queryKey: ['community-feed', regionId ?? 'all'],
    staleTime: 30_000,
    queryFn: async (): Promise<FeedPost[]> => {
      const postsResult = await supabase
        .from('session_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (postsResult.error) throw postsResult.error;
      const posts = postsResult.data ?? [];
      if (posts.length === 0) return [];

      const sessionResult = await supabase
        .from('run_sessions')
        .select('*')
        .in('id', [...new Set(posts.map((post) => post.session_id))]);
      if (sessionResult.error) throw sessionResult.error;
      const sessions = (sessionResult.data ?? []).filter(
        (item) => regionId == null || item.region_id === regionId,
      );
      const sessionById = new Map(sessions.map((item) => [item.id, item]));
      const visiblePosts = posts.filter((post) => sessionById.has(post.session_id));
      if (visiblePosts.length === 0) return [];

      const [mediaResult, profilesResult, labels] = await Promise.all([
        supabase
          .from('session_media')
          .select('*')
          .in(
            'post_id',
            visiblePosts.map((post) => post.id),
          ),
        supabase
          .from('profiles')
          .select('id,display_name')
          .in('id', [...new Set(visiblePosts.map((post) => post.author_id))]),
        sessionLabels(sessions),
      ]);
      if (mediaResult.error) throw mediaResult.error;
      if (profilesResult.error) throw profilesResult.error;
      const profileById = new Map(
        (profilesResult.data ?? []).map((profile) => [profile.id, profile.display_name]),
      );

      return visiblePosts.map((post) => {
        const session = sessionById.get(post.session_id)!;
        const sport = labels.sports.get(session.sport_id);
        return {
          ...post,
          authorName: profileById.get(post.author_id) ?? 'Drop In player',
          media: (mediaResult.data ?? [])
            .filter((item) => item.post_id === post.id)
            .map((item) => ({ ...item, url: publicMediaUrl(item) })),
          session,
          sessionTitle: labels.series.get(session.run_series_id) ?? 'Pickup session',
          venueName: labels.venues.get(session.venue_id) ?? 'Local venue',
          sportName: sport?.name ?? 'Sport',
          sportSlug: sport?.slug ?? '',
        };
      });
    },
  });
}

export function useJoinedSessions(userId?: string) {
  return useQuery({
    queryKey: ['joined-sessions', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<JoinedSession[]> => {
      const memberships = await supabase
        .from('session_memberships')
        .select('session_id')
        .eq('user_id', userId!);
      if (memberships.error) throw memberships.error;
      const ids = (memberships.data ?? []).map((item) => item.session_id);
      if (ids.length === 0) return [];

      const [sessionsResult, messagesResult] = await Promise.all([
        supabase.from('run_sessions').select('*').in('id', ids).order('starts_at'),
        supabase
          .from('session_messages')
          .select('*')
          .in('session_id', ids)
          .order('created_at', { ascending: false }),
      ]);
      if (sessionsResult.error) throw sessionsResult.error;
      if (messagesResult.error) throw messagesResult.error;
      const sessions = sessionsResult.data ?? [];
      const labels = await sessionLabels(sessions);

      return sessions.map((session) => {
        const sport = labels.sports.get(session.sport_id);
        return {
          ...session,
          title: labels.series.get(session.run_series_id) ?? 'Pickup session',
          venueName: labels.venues.get(session.venue_id) ?? 'Local venue',
          sportName: sport?.name ?? 'Sport',
          sportSlug: sport?.slug ?? '',
          lastMessage:
            (messagesResult.data ?? []).find((item) => item.session_id === session.id) ?? null,
        };
      });
    },
  });
}

export function useSessionMessages(sessionId?: string) {
  return useQuery({
    queryKey: ['session-messages', sessionId],
    enabled: Boolean(sessionId),
    refetchInterval: 8_000,
    queryFn: async () => {
      const messages = await supabase
        .from('session_messages')
        .select('*')
        .eq('session_id', sessionId!)
        .order('created_at');
      if (messages.error) throw messages.error;
      const authorIds = [...new Set((messages.data ?? []).map((item) => item.user_id))];
      const profiles = authorIds.length
        ? await supabase.from('profiles').select('id,display_name').in('id', authorIds)
        : { data: [], error: null };
      if (profiles.error) throw profiles.error;
      const names = new Map((profiles.data ?? []).map((item) => [item.id, item.display_name]));
      return (messages.data ?? []).map((message) => ({
        ...message,
        authorName: names.get(message.user_id) ?? 'Player',
      }));
    },
  });
}

export function useSessionOverview(sessionId?: string, userId?: string) {
  return useQuery({
    queryKey: ['session-overview', sessionId, userId],
    enabled: Boolean(sessionId),
    queryFn: async () => {
      const result = await supabase.from('run_sessions').select('*').eq('id', sessionId!).single();
      if (result.error) throw result.error;
      const labels = await sessionLabels([result.data]);
      const sport = labels.sports.get(result.data.sport_id);
      let isMember = false;
      if (userId) {
        const membership = await supabase
          .from('session_memberships')
          .select('session_id')
          .eq('session_id', sessionId!)
          .eq('user_id', userId)
          .maybeSingle();
        if (membership.error) throw membership.error;
        isMember = Boolean(membership.data);
      }
      return {
        ...result.data,
        title: labels.series.get(result.data.run_series_id) ?? 'Pickup session',
        venueName: labels.venues.get(result.data.venue_id) ?? 'Local venue',
        sportName: sport?.name ?? 'Sport',
        sportSlug: sport?.slug ?? '',
        isMember,
      };
    },
  });
}

export function useJoinSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { runSeriesId: string; occurrenceDate: string }) => {
      const { data, error } = await supabase.rpc('join_run_session', {
        p_run_series_id: input.runSeriesId,
        p_occurrence_date: input.occurrenceDate,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['joined-sessions'] }),
  });
}

export function useSendMessage(sessionId: string, userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const result = await supabase
        .from('session_messages')
        .insert({ session_id: sessionId, user_id: userId, body: body.trim() });
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['session-messages', sessionId] });
      await client.invalidateQueries({ queryKey: ['joined-sessions'] });
    },
  });
}

export async function publishSessionPost(input: {
  sessionId: string;
  userId: string;
  caption: string;
  asset?: {
    uri: string;
    kind: 'image' | 'video';
    mimeType: string;
    width?: number;
    height?: number;
    durationSeconds?: number;
  };
}) {
  if (input.asset?.kind === 'video' && (input.asset.durationSeconds ?? 31) > 30) {
    throw new Error('Clips must be 30 seconds or shorter.');
  }

  const post = await supabase
    .from('session_posts')
    .insert({ session_id: input.sessionId, author_id: input.userId, caption: input.caption.trim() })
    .select('id')
    .single();
  if (post.error) throw post.error;
  if (!input.asset) return post.data.id;

  const extension = input.asset.mimeType.includes('png')
    ? 'png'
    : input.asset.kind === 'video'
      ? 'mp4'
      : 'jpg';
  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${input.userId}/${post.data.id}/${uniqueName}.${extension}`;
  const body = await fetch(input.asset.uri).then((response) => response.arrayBuffer());
  const upload = await supabase.storage
    .from('session-media')
    .upload(path, body, { contentType: input.asset.mimeType, upsert: false });
  if (upload.error) throw upload.error;

  const media = await supabase.from('session_media').insert({
    post_id: post.data.id,
    uploader_id: input.userId,
    kind: input.asset.kind,
    storage_path: path,
    width: input.asset.width,
    height: input.asset.height,
    duration_seconds: input.asset.durationSeconds,
  });
  if (media.error) throw media.error;
  return post.data.id;
}

export function usePublishSessionPost(sessionId: string, userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      caption: string;
      asset?: {
        uri: string;
        kind: 'image' | 'video';
        mimeType: string;
        width?: number;
        height?: number;
        durationSeconds?: number;
      };
    }) => publishSessionPost({ ...input, sessionId, userId }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['community-feed'] }),
  });
}
