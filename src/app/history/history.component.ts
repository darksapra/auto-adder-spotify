import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { Subscription } from 'rxjs';
import { Track } from '../models/track.model';
import { SpotifyService } from '../services/spotify.service';
import { SimpleTrack } from '../models/simpletrack.model';

@Component({
  selector: 'app-history',
  templateUrl: './history.component.html',
  styleUrls: ['./history.component.scss']
})
export class HistoryComponent implements OnInit {

  @Output() closedEvent = new EventEmitter();

  public RecentlyPlayed: Array<SimpleTrack> | undefined;
  private subs: Subscription;
  constructor(private spotify: SpotifyService) {
    this.subs = spotify.onChangeTrack.subscribe(() => {
      this.RecentlyPlayed = spotify.getRecentlyPlayed().reverse()
    })
  }

  ngOnInit(): void {
    this.RecentlyPlayed = this.spotify.getRecentlyPlayed().reverse()
  }
  ngOnDestroy() {
    this.subs.unsubscribe();
  }
  close() {
    this.closedEvent.emit();
  }
  public trackBy(index: number, track: SimpleTrack) {
    return track.id; // or any other identifier
  }
}
