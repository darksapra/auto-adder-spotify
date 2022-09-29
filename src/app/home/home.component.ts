import { Component, NgZone, OnInit, ViewChild } from '@angular/core';
import { FormControl } from '@angular/forms';
import { App, URLOpenListenerEvent } from '@capacitor/app';
import { Palette } from 'node-vibrant/lib/color';
import { emit } from 'process';
import {  concatMap, map, merge, mergeMap, Observable, of, startWith, Subscription } from 'rxjs';
import { Playlist } from '../models/playlist.model';
import { TrackState } from '../models/track.model';
import { User } from '../models/user.model';
import { AuthorizationService } from '../services/authorization.service';
import { ConfiguratorService } from '../services/configurator.service';
import { SpotifyService } from '../services/spotify.service';
import { VisualService } from '../services/visual.service';
import { TrackComponent } from '../track/track.component';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})

export class HomeComponent implements OnInit {

  @ViewChild(TrackComponent) trackChild !: TrackComponent;
  @ViewChild('targetImage') targetElement:any;

  protected user: User|undefined
  //protected playlist: Playlist|undefined;
  private onChangeSubscription:Subscription|undefined;
  private onRefreshSubscription:Subscription|undefined;
  availablePlaylists: Observable<Playlist[]> |undefined;
  myControl = new FormControl('');
  protected palette: Palette|undefined;
  constructor(private auth: AuthorizationService, protected apiRequester: SpotifyService, protected visual: VisualService, protected config: ConfiguratorService, private zone: NgZone) {
    if(window.location.search.length > 0){
      this.handleRedirect().subscribe(
        () => this.initialize()
      );
    }
    else
      this.initialize();
    
      App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
        this.zone.run(() => {
          const search = event.url.split("://").pop();
          const urlParams = new URLSearchParams(search);
          const code = urlParams.get('code')
          this.auth.fetchAccessToken(code).subscribe(()=>
            this.initialize());
        });
    });
    this.apiRequester.getPlaylists().subscribe((data:any) => {
      const playlists = data.items as Playlist[];
      this.availablePlaylists = this.myControl.valueChanges.pipe(
        startWith(''),
        map(
        (value => {
          return this._filter(value || '', playlists)
        })))
    })

/*     this.availablePlaylists = this.apiRequester.getPlaylists().pipe(
      concatMap( data => from(this.myControl.valueChanges.pipe(mergeMap((value:string)=> this._filter(value, data as Playlist[])))))
    ); */
  }

  private _filter(value: string, existing: Playlist[]): Playlist[] {
    const filterValue = value.toLowerCase();
    return existing.filter(playlist => playlist.name.toLowerCase().includes(filterValue));
  }

  ngOnInit(): void {
  }
  ngOnDestroy(){
    this.onChangeSubscription?.unsubscribe();
    this.onRefreshSubscription?.unsubscribe();
  }

  addCurrentSong()
  {
    if(this.apiRequester.playState != undefined)
      this.apiRequester.addCurrentSong(this.apiRequester.playState);
  }

  initialize()
  {
    if(this.auth.authorizationValues)
      this.onRefreshSubscription=this.apiRequester.refresher.subscribe(() => this.refreshCurrentlyPlaying());
  }

  refreshCurrentlyPlaying()
  {
    this.apiRequester.getPlayingState().subscribe();
  }
  getTrackImage(){
    return this.visual.getBestImageUrl(this.apiRequester.currentTrack?.album.images,this.targetElement?.nativeElement.offsetHeight)
  }
  getPlaylistImage(){
    if(this.apiRequester.currentTrack?.playlist != undefined)
      return this.apiRequester.currentTrack?.playlist.images[0].url;
    else
      return "";
  }

  canAdd():boolean{
    return this.apiRequester.currentTrack?.trackState != TrackState.NotOnPlaylist;
  }

  handleRedirect() : Observable<any>{
    let code = this.getCode();
    return this.auth.fetchAccessToken(code);
  }

  getCode(){
    let code = null;
    const queryString = window.location.search;
    if(queryString.length > 0){
      const urlParams = new URLSearchParams(queryString);
      code = urlParams.get('code')
    }
    return code;
  }
}