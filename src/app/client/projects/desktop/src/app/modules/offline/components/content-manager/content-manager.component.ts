import { Component, OnInit } from '@angular/core';
import { ResourceService, ToasterService, ConfigService } from '@sunbird/shared';
import { timer, Subject, combineLatest } from 'rxjs';
import { switchMap, map, filter } from 'rxjs/operators';
import * as _ from 'lodash-es';
import { ContentManagerService, ElectronDialogService } from '../../services';
import { Router, ActivatedRoute } from '@angular/router';
import { IInteractEventEdata } from '@sunbird/telemetry';

@Component({
  selector: 'app-content-manager',
  templateUrl: './content-manager.component.html',
  styleUrls: ['./content-manager.component.scss']
})
export class ContentManagerComponent implements OnInit {

  contentResponse: any;
  isOpen = true;
  callContentList = false;
  callContentListTimer = false;
  contentStatusObject = {};
  subscription: any;
  localStatusArr = ['inProgress', 'inQueue', 'resume', 'resuming', 'pausing', 'canceling'];
  cancelId: string;
  apiCallTimer = timer(1000, 3000).pipe(filter(data => !data || (this.callContentList)));
  apiCallSubject = new Subject();
  completedCount: number;
  constructor(public contentManagerService: ContentManagerService,
    public resourceService: ResourceService, public toasterService: ToasterService,
    public electronDialogService: ElectronDialogService,
    public configService: ConfigService,
    public activatedRoute: ActivatedRoute,
    public router: Router) {
    this.getList();
    document.addEventListener('content:import', (event) => {
      this.isOpen = true;
      this.apiCallSubject.next();
    });
  }

  ngOnInit() {
    // Call download list initially
    this.apiCallSubject.next();

    // Call content list when clicked on add to library
    this.contentManagerService.downloadEvent.subscribe((data) => {
      this.isOpen = true;
      this.apiCallSubject.next();
    });
  }

  getList() {
    combineLatest(this.apiCallTimer, this.apiCallSubject, (data1, data2) => true)
      .pipe(filter(() => this.isOpen), switchMap(() => this.contentManagerService.getContentList()),
        map((resp: any) => {
          this.callContentList = false;
          let completedCount = 0;
          _.forEach(_.get(resp, 'result.response.contents'), (value) => {
            const data = this.contentStatusObject[value.id];
            if (data) { value.status = data.currentStatus; }
            if (_.includes(this.localStatusArr, value.status)) {
              this.callContentList = true;
            }
            if (value.status === 'completed') {
              completedCount += 1;
            }
          });
          if ((completedCount > this.completedCount) && this.completedCount !== undefined) {
            this.contentManagerService.completeEvent.emit();
          }
          this.completedCount = completedCount;
          return _.get(resp, 'result.response.contents');
        })).subscribe((apiResponse: any) => {
          this.contentResponse = apiResponse;
        });
  }

  contentManagerActions(type: string, action: string, contentId: string) {
    switch (`${action.toUpperCase()}_${type.toUpperCase()}`) {
      case 'PAUSE_IMPORT':
        this.pauseImportContent(contentId);
        break;
      case 'RESUME_IMPORT':
        this.resumeImportContent(contentId);
        break;
      case 'CANCEL_IMPORT':
        this.cancelImportContent(contentId);
        break;
      case 'RETRY_IMPORT':
        this.retryImportContent(contentId);
        break;
      case 'PAUSE_DOWNLOAD':
        this.pauseDownloadContent(contentId);
        break;
      case 'RESUME_DOWNLOAD':
        this.resumeDownloadContent(contentId);
        break;
      case 'CANCEL_DOWNLOAD':
        this.cancelDownloadContent(contentId);
        break;
      case 'RETRY_DOWNLOAD':
        this.retryDownloadContent(contentId);
        break;
    }
  }

  updateLocalStatus(contentData, currentStatus) {
    this.contentStatusObject[contentData.id] = {
      currentStatus: currentStatus,
      previousState: contentData.status
    };
    const data = _.find(this.contentResponse, { id: contentData.id });
    data.status = currentStatus;
  }

  private getSubscription(contentId) {
    const _this = this;
    return ({
      next(apiResponse: any) {
        _this.deleteLocalContentStatus(contentId);
        _this.apiCallSubject.next();
      },
      error(err) {
        _this.deleteLocalContentStatus(contentId);
        _this.toasterService.error(_this.resourceService.messages.fmsg.m0097);
        _this.apiCallSubject.next();
      }
    });
  }

  cancelDownloadContent(contentId) {
    this.contentManagerService.cancelDownloadContent(contentId).subscribe(this.getSubscription(contentId));
  }

  pauseDownloadContent(contentId) {
    this.contentManagerService.pauseDownloadContent(contentId).subscribe(this.getSubscription(contentId));
  }

  resumeDownloadContent(contentId) {
    this.contentManagerService.resumeDownloadContent(contentId).subscribe(this.getSubscription(contentId));
  }

  retryDownloadContent(contentId) {
    this.contentManagerService.resumeDownloadContent(contentId).subscribe(this.getSubscription(contentId));
  }

  cancelImportContent(contentId) {
    this.contentManagerService.cancelImportContent(contentId).subscribe(this.getSubscription(contentId));
  }

  pauseImportContent(contentId) {
    this.contentManagerService.pauseImportContent(contentId).subscribe(this.getSubscription(contentId));
  }

  resumeImportContent(contentId) {
    this.contentManagerService.resumeImportContent(contentId).subscribe(this.getSubscription(contentId));
  }

  retryImportContent(contentId) {
    this.contentManagerService.retryImportContent(contentId).subscribe(this.getSubscription(contentId));
  }

  deleteLocalContentStatus(contentId) {
    delete this.contentStatusObject[contentId];
  }

  getContentPercentage(progressSize, totalSize) {
    return (progressSize / totalSize) * 100;
  }

  openContent(contentId, mimeType, status) {
    if (status === 'completed') {
      if (mimeType === this.configService.appConfig.PLAYER_CONFIG.MIME_TYPE.collection) {
        this.router.navigate(['play/collection', contentId]);
      } else {
        this.router.navigate(['play/content', contentId]);
      }
    }
  }

  getTelemetryInteractData() {
    const pageId = _.get(this.activatedRoute, 'snapshot.root.firstChild.data.telemetry.env') ||
      _.get(this.activatedRoute, 'snapshot.data.telemetry.env') ||
      _.get(this.activatedRoute.snapshot.firstChild, 'children[0].data.telemetry.env');
    return {
      id: this.isOpen ? 'content-manager-close' : 'content-manager-open',
      type: 'click',
      pageid: pageId
    };
  }

  getButtonsInteractData(id, percentage) {
    const pageId = _.get(this.activatedRoute, 'snapshot.root.firstChild.data.telemetry.env') ||
      _.get(this.activatedRoute, 'snapshot.data.telemetry.env') ||
      _.get(this.activatedRoute.snapshot.firstChild, 'children[0].data.telemetry.env');
    const interactData = {
      id: id,
      type: 'click',
      pageid: pageId
    };

    if (percentage) {
      interactData['extra'] = {
        percentage: percentage
      };
    }
    return interactData;
  }
}
