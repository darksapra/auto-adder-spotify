import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BackgroundMode } from '@awesome-cordova-plugins/background-mode';
import { Capacitor } from '@capacitor/core';
import { map, Observable, of, Subject, switchMap, timer } from 'rxjs';
import { PlayingState } from '../models/playingstate.model';
import { Playlist } from '../models/playlist.model';
import { Track, TrackState } from '../models/track.model';
import { ConfiguratorService } from './configurator.service';


@Injectable({
  providedIn: 'root'
})

export class SpotifyService {

  refresher = timer(0, 2000);
  public currentTrack: Track | undefined;
  public playState: PlayingState | undefined;
  public selectedPlaylsit: Playlist | undefined;
  protected playingPlaylist: Playlist | undefined;

  public targetPlaylist: Playlist | undefined;

  public onChangeTrack: Subject<{ previousTrack: Track | undefined, state: PlayingState | undefined, currentTrack: Track | undefined }> = new Subject();
  private notPlayingTracks: number = 0;
  constructor(private http: HttpClient, private config: ConfiguratorService) {
  }

  updatePlayState() {
    const url = "https://api.spotify.com/v1/me/player/currently-playing";
    return this.http.get<PlayingState>(url).pipe(map((data: PlayingState) => {
      this.playState = data != null ? data : undefined;

      if (this.currentTrack?.id !== data?.item?.id) {
        let item = this.isPlayingPlaylist(this.playState);
        data.item.trackState = TrackState.NoPlaylistPlaying;
        this.getPlaylist(item.id).subscribe((playlist: Playlist) => {
          this.playingPlaylist = playlist;
          this.refreshTargetPlaylist();
        })

        let array: Array<Track> = this.getRecentlyPlayed();
        if (this.currentTrack != undefined)
          array.push(this.currentTrack);
        this.saveHistory(array);

        const previousTrack = this.currentTrack;
        this.currentTrack = data.item;
        this.onChangeTrack.next({ previousTrack: previousTrack, state: this.playState, currentTrack: this.currentTrack });
      }

      if (Capacitor.isNativePlatform())
      {
        if (BackgroundMode.isActive()) {
          if (this.currentTrack == undefined) {
            BackgroundMode.configure({
              text: "Not playing a playlist"
            })
            this.notPlayingTracks++;
            if (this.notPlayingTracks > 40)
              BackgroundMode.disable();
          }
          else {
            this.notPlayingTracks = 0;
            BackgroundMode.configure({
              text: "The target playlist is " + this.targetPlaylist?.name
            })
          }
        }
      }

      if (this.currentTrack?.trackState == TrackState.NotOnPlaylist)
        this.checkNextStep(this.currentTrack, data);
      return this.playState;
    }));
  }

  saveHistory(array: Array<Track>) {
    array = array.filter((_, index) => index > array.length - 20);
    localStorage.setItem("previousTracks", JSON.stringify(array));
  }


  updateCurrentTrackState(playlist: Playlist | undefined) {
    if (this.currentTrack == undefined)
      return;
    if (playlist == undefined)
      this.currentTrack.trackState = TrackState.NoPlaylistPlaying;
    else {
      if (this.currentTrack.trackState != TrackState.AddedToPlaylist && this.currentTrack.trackState != TrackState.RemovedFromPlaylist) {
        this.isTrackInPlaylist(this.currentTrack.id, playlist.id).subscribe((isInPlaylist: boolean) => {
          if (this.currentTrack == undefined)
            return;

          if (isInPlaylist)
            this.currentTrack.trackState = TrackState.AlreadyOnPlaylist;
          else
            this.currentTrack.trackState = TrackState.NotOnPlaylist;

          this.currentTrack.addedAtPlaylist = playlist;
        })
      }
    }

  }

  isPlayingPlaylist(state: PlayingState | undefined) {
    if (state == undefined || state.context == undefined || state.context.uri == undefined)
      return { isPlay: false, id: "" };
    const parts = state.context.uri.split(":");
    const playlistId = parts[2];
    return { isPlay: parts[1] == "playlist", id: playlistId };
  }

  isTrackInPlaylist(trackId: string, playlistId: string): Observable<boolean> {
    const url = "https://api.spotify.com/v1/playlists/" + playlistId + "/tracks"
    return this.http.get(url).pipe(switchMap((data: any) => {
      let found: boolean = false;
      data.items.forEach((element: any) => {
        found = found || element.track.id === trackId;
      });
      return of(found);
    }));
  }
  getTrackProgress() {
    if (this.playState != undefined && this.currentTrack != undefined)
      return (this.playState?.progress_ms / this.currentTrack?.duration_ms) * 100;
    return 0;
  }

  refreshTargetPlaylist() {
    let config = this.config.loadConfig();
    if (!config.custom_enabled)
      this.targetPlaylist = this.playingPlaylist;
    else
      this.targetPlaylist = this.selectedPlaylsit;

    this.updateCurrentTrackState(this.targetPlaylist);
  }

  private getPlaylist(id: string | undefined) {
    const url = "https://api.spotify.com/v1/playlists/" + id;
    return this.http.get<Playlist>(url);
  }

  getPlaylistImage() {
    if (Capacitor.isNativePlatform() && BackgroundMode.isActive())
      return ""

    if (this.targetPlaylist != undefined)
      return this.targetPlaylist?.images[0].url;
    else
      return "";
  }

  getPlaylists() {
    const url = "https://api.spotify.com/v1/me/playlists?limit=50";
    return this.http.get(url)
  }

  getRecentlyPlayed() {
    let json = localStorage.getItem("previousTracks");
    if (json != null)
      return JSON.parse(json);
    else
      return new Array<Track>();
  }

  addTrackToPlaylist(track: Track, playlistId: string) {
    let url = "https://api.spotify.com/v1/playlists/" + playlistId + "/tracks";
    url += "?uris=" + encodeURI(track.uri);
    return this.isTrackInPlaylist(track.id, playlistId).pipe(switchMap((resultObs) => {
      if (!resultObs)
        return this.http.post(url, "").pipe(switchMap((result: any) => {
          return of(result.snapshot_id ? "success" : "failure");
        }));
      else
        return of("exists");
    }))
  }

  protected checkNextStep(currentTrack: Track, state: PlayingState) {
    const conf = this.config.loadConfig();
    const progress = (state.progress_ms / currentTrack.duration_ms) * 100;
    if (state != null && this.currentTrack != undefined) {
      if (conf.autoAdd && progress > conf.whenToAdd)
        this.addTrackToTargetPlaylist(this.currentTrack);

      if (conf.autoRemove && progress > conf.whenToRemove)
        this.autoRemove(state);
    }
  }

  addTrackToTargetPlaylist(track: Track) {
    if (this.targetPlaylist != undefined) {
      const playlistId = this.targetPlaylist.id;
      this.addTrackToPlaylist(track, playlistId).subscribe((result: any) => {
        if (this.currentTrack != undefined) {
          if (result == "success" && this.currentTrack != undefined) {
            this.currentTrack.trackState = TrackState.AddedToPlaylist;
          } else if (result == "exists") {
            this.currentTrack.trackState = TrackState.AlreadyOnPlaylist;
          }
          this.currentTrack.addedAtPlaylist = this.targetPlaylist!;
        }
      });
    }
    else {
      if (this.currentTrack != undefined)
        this.currentTrack.trackState = TrackState.NotOnPlaylist;
    }
  }
  autoRemove(state: PlayingState) {

  }
}