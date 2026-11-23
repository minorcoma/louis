import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mediaSearchAction, parseSoundcloudUrl, parseSpotifyUrl } from './mediaLink.ts'
import { pickYoutubeMatch, spotifyListingFromEmbed, spotifyYoutubeQuery } from './spotifyMatch.ts'
import { finishSoundcloudListing, soundcloudListingFromHydration, soundcloudListingToTracks } from './soundcloudTracks.ts'
import { buildSavePlan, EMPTY_CARD_DETAIL } from './buildSavePlan.ts'
import { getStandalonePlaylistValidationError } from './standalonePlaylist.ts'
import type { PlaylistTrack } from './types.ts'

describe('parseSpotifyUrl', () => {
  it('reads tracks, albums, playlists, and URI links', () => {
    assert.deepEqual(
      parseSpotifyUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc'),
      { kind: 'spotify', entity: 'track', id: '4cOdK2wGLETKBW3PvgPWqT' },
    )
    assert.deepEqual(
      parseSpotifyUrl('https://open.spotify.com/intl-de/album/6dVIqQ8qmQ5GBnJ9shOYGE'),
      { kind: 'spotify', entity: 'album', id: '6dVIqQ8qmQ5GBnJ9shOYGE' },
    )
    assert.deepEqual(
      parseSpotifyUrl('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M'),
      { kind: 'spotify', entity: 'playlist', id: '37i9dQZF1DXcBWIGoYBM5M' },
    )
    assert.equal(parseSpotifyUrl('http://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'), null)
    assert.equal(parseSpotifyUrl('https://open.spotify.com/artist/0gxyHStUsqpMadRV0Di1Qt')?.kind, 'spotify-unsupported')
  })
})

describe('parseSoundcloudUrl', () => {
  it('reads a track, a set, and a short link', () => {
    assert.deepEqual(
      parseSoundcloudUrl('https://soundcloud.com/forss/flickermood?si=1'),
      {
        kind: 'soundcloud-track',
        user: 'forss',
        slug: 'flickermood',
        url: 'https://soundcloud.com/forss/flickermood',
      },
    )
    assert.equal(parseSoundcloudUrl('https://m.soundcloud.com/forss/sets/soulhack')?.kind, 'soundcloud-set')
    assert.equal(parseSoundcloudUrl('https://on.soundcloud.com/abc123')?.kind, 'soundcloud-short')
    assert.equal(parseSoundcloudUrl('https://soundcloud.com/forss')?.kind, 'soundcloud-unsupported')
    assert.equal(parseSoundcloudUrl('https://soundcloud.com.example/forss/flickermood'), null)
  })
})

describe('mediaSearchAction', () => {
  it('offers Add and Add all for Spotify and SoundCloud', () => {
    assert.equal(mediaSearchAction('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT', false).label, 'Add')
    assert.equal(mediaSearchAction('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', false).label, 'Add all')
    assert.equal(mediaSearchAction('https://soundcloud.com/forss/flickermood', false).kind, 'add-soundcloud')
    assert.equal(mediaSearchAction('https://soundcloud.com/forss/sets/soulhack', false).label, 'Add all')
    assert.equal(mediaSearchAction('beach boys', false).kind, 'search')
  })
})

describe('spotify matching', () => {
  it('reads a track list and picks the closest YouTube title', () => {
    const listing = spotifyListingFromEmbed({
      props: {
        pageProps: {
          state: {
            data: {
              entity: {
                name: 'Today’s Top Hits',
                trackList: [
                  {
                    uri: 'spotify:track:4HCOHRCSQelz2GPX8iTamO',
                    title: 'Flower In A Hurricane',
                    subtitle: 'Justice',
                    duration: 224877,
                    isPlayable: true,
                  },
                  {
                    uri: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa',
                    title: 'Hidden',
                    subtitle: 'Nope',
                    isPlayable: false,
                  },
                ],
              },
            },
          },
        },
      },
    })
    assert.equal(listing?.tracks.length, 1)
    assert.equal(listing?.tracks[0]?.artist, 'Justice')
    assert.equal(listing?.tracks[0]?.durationSeconds, 225)
    assert.equal(spotifyYoutubeQuery(listing!.tracks[0]!), 'Justice Flower In A Hurricane')

    const match = pickYoutubeMatch(listing!.tracks[0]!, [
      { id: 'long', title: 'Flower In A Hurricane (10 hour loop)', channelTitle: 'Loops', durationSeconds: 36000 },
      { id: 'right', title: 'Justice - Flower In A Hurricane (Official Video)', channelTitle: 'Justice', durationSeconds: 226 },
      { id: 'other', title: 'Something else', channelTitle: 'Justice', durationSeconds: 225 },
    ])
    assert.equal(match?.id, 'right')
  })
})

describe('soundcloud tracks', () => {
  it('reads hydration and splits a long track', () => {
    const listing = soundcloudListingFromHydration([
      {
        hydratable: 'playlist',
        data: {
          title: 'Soulhack',
          tracks: [
            {
              id: 293,
              title: 'Flickermood',
              permalink_url: 'https://soundcloud.com/forss/flickermood',
              duration: 180_000,
              public: true,
              artwork_url: 'https://i1.sndcdn.com/artworks-large.jpg',
              user: { username: 'Forss' },
            },
            { id: 295, kind: 'track' },
            {
              id: 294,
              title: 'Private',
              permalink_url: 'https://soundcloud.com/forss/private',
              duration: 1000,
              public: false,
            },
          ],
        },
      },
    ])
    const finished = finishSoundcloudListing(listing!, [{
      id: '295',
      title: 'Paradigm Shift',
      artist: 'Forss',
      url: 'https://soundcloud.com/forss/paradigm-shift',
      thumbnailUrl: '',
      durationSeconds: 358,
    }])
    assert.equal(finished?.tracks.map(track => track.title).join(','), 'Flickermood,Paradigm Shift')
    assert.equal(finished?.tracks[0]?.thumbnailUrl, 'https://i1.sndcdn.com/artworks-t500x500.jpg')

    const long = soundcloudListingToTracks([{
      ...finished!.tracks[0]!,
      durationSeconds: 70 * 60,
    }], 15 * 60)
    assert.ok(long.length >= 2)
    assert.ok(long.every(track => (track.duration ?? 0) <= 55 * 60))
    assert.equal(long[0]?.source, 'soundcloud')
    assert.equal(long[0]?.soundcloud?.id, '293')

    const plan = buildSavePlan([], long, EMPTY_CARD_DETAIL)
    assert.equal(plan.errors.length, 0)
    assert.equal(plan.tracks.every(action => action.kind === 'extract-soundcloud'), true)

    const one: PlaylistTrack = soundcloudListingToTracks(finished!.tracks, 15 * 60)[0]!
    assert.equal(getStandalonePlaylistValidationError('Bedtime', [one]), null)
  })
})
