import { UserService } from '@sunbird/core';
import { IGroupCard, GROUP_DETAILS, MY_GROUPS, CREATE_GROUP, acceptTnc } from './../../interfaces';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { GroupsService } from '../../services';
import { ResourceService, LayoutService } from '@sunbird/shared';
import { Router, ActivatedRoute } from '@angular/router';
import * as _ from 'lodash-es';
import { Subject } from 'rxjs';
import { takeUntil, delay } from 'rxjs/operators';
import { IImpressionEventInput } from '@sunbird/telemetry';
import { CsGroupSearchCriteria } from '@project-sunbird/client-services/services/group/interface';

@Component({
  selector: 'app-my-groups',
  templateUrl: './my-groups.component.html',
  styleUrls: ['./my-groups.component.scss']
})
export class MyGroupsComponent implements OnInit, OnDestroy {
  showGroupCreateForm = false;
  groupsList: IGroupCard[] = [];
  public showModal = false;
  private unsubscribe$ = new Subject<void>();
  telemetryImpression: IImpressionEventInput;
  isLoader = true;
  layoutConfiguration;
  showTncModal = false;
  selectedType: acceptTnc = acceptTnc.ALL;
  selectedGroup: {};
  latestTnc: {};

  constructor(public groupService: GroupsService,
    public router: Router,
    public resourceService: ResourceService,
    private userService: UserService,
    private activatedRoute: ActivatedRoute,
    private layoutService: LayoutService
    ) { }

  ngOnInit() {
    this.groupService.isUserAcceptedTnc();
    this.initLayout();
    this.showModal = !localStorage.getItem('login_ftu_groups');
    this.getMyGroupList();
    this.groupService.closeForm.pipe(takeUntil(this.unsubscribe$)).subscribe(() => {
      this.getMyGroupList();
    });
    this.groupService.emitNotAcceptedGroupsTnc.pipe(delay(600)).subscribe((data) => {
      this.latestTnc = _.get(data, 'tnc');
      if (this.groupsList.length === 0) {
        this.acceptAllGroupsTnc();
      } else {
        this.showTncModal = !_.get(data, 'accepted');
      }
    });
    this.telemetryImpression = this.groupService.getImpressionObject(this.activatedRoute.snapshot, this.router.url);
  }
  initLayout() {
    this.layoutConfiguration = this.layoutService.initlayoutConfig();
    this.layoutService.switchableLayout().
    pipe(takeUntil(this.unsubscribe$)).subscribe(layoutConfig => {
    if (layoutConfig != null) {
      this.layoutConfiguration = layoutConfig.layout;
    }
   });
  }


  getMyGroupList() {
    this.isLoader = true;
    this.groupsList = [];
    const request: CsGroupSearchCriteria = {filters: {userId: this.userService.userid}};
    this.groupService.searchUserGroups(request).pipe(takeUntil(this.unsubscribe$)).subscribe(groups => {
      this.groupService.groupListCount = groups.length;
      this.isLoader = false;
      groups = this.groupService.addGroupPaletteList(groups || []);
      _.forEach(groups, (group) => {
        if (group) {
          group = this.groupService.addGroupFields(group);
          this.groupsList.push(group);
        }
      });
    }, (err) => {
      this.isLoader = false;
      this.groupsList = [];
    });
  }

  public showCreateFormModal() {
    this.router.navigate([`${MY_GROUPS}/${CREATE_GROUP}`]);
  }

  public navigateToDetailPage(event) {
    this.selectedType = acceptTnc.GROUP;
    this.selectedGroup = event.data;
    this.showTncModal = _.get(event, 'data.visited') === false;
    if (_.get(event, 'data.status') === 'suspended') {
      this.addTelemetry('suspended-group-card', _.get(event, 'data.id'));
    } else {
      this.addTelemetry('group-card', _.get(event, 'data.id'));
    }

    if (!this.showTncModal) {
      this.navigate(event);
    }
  }

  navigate(event) {
    this.router.navigate([`${MY_GROUPS}/${GROUP_DETAILS}`, _.get(event, 'data.id')]);
  }

  showFtuPopup() {
    this.showModal = !this.showModal;
  }

  closeModal() {
    this.showModal = false;
    localStorage.setItem('login_ftu_groups', 'login_user');
  }

  addTelemetry (id, groupId?) {
    const selectedGroup = _.find(this.groupsList, {id: groupId});
    const obj = selectedGroup ? {id: groupId, type: 'group', ver: '1.0'} : {};
    this.groupService.addTelemetry({id, extra: {status: _.get(selectedGroup, 'status')}}, this.activatedRoute.snapshot, [], groupId, obj);
  }

  handleGroupTnc(event?: {type: string, data: {}}) {
    if (event) {
      switch (event.type) {
        case acceptTnc.ALL:
          this.acceptAllGroupsTnc();
          break;
        case acceptTnc.GROUP:
          this.acceptGroupTnc(_.get(event, 'data'));
          break;
      }
    } else {
      this.showTncModal = false;
    }
  }

  acceptGroupTnc(event: {}) {
    const request = {
      members: [{
        userId: this.userService.userid,
        visited: true,
      }]
    };
    this.groupService.updateMembers(_.get(event, 'id'), request).subscribe(data => {
      this.showTncModal = false;
      this.navigate({data: event});
    }, err => {
      this.showTncModal = false;
    });
  }

  acceptAllGroupsTnc() {
    const requestBody = {
      request: {
        tncType: _.get(this.latestTnc, 'field'),
        version:  _.get(this.latestTnc, 'value.latestVersion'),
        userId:  this.userService.userid
      }
    };

    this.userService.acceptTermsAndConditions(requestBody).subscribe(data => {
      this.showTncModal = false;
      window.location.reload();
    }, err => {
      this.showTncModal = false;
    });
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }
}
