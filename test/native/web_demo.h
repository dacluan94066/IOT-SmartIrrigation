#pragma once
#include "DemoSession.h"

// Production policies + controller, clock giả lập; không phải GPIO/Wokwi.
void testWebDemo() {
  DemoSession demo;
  check(!demo.active() && !demo.takeEnded(),"Web demo defaults inactive after boot");
  check(!demo.activate(1,22,20,0,0,0),"Demo rejects zero TTL");
  check(!demo.activate(1,22,20,60001,0,0),"Demo rejects TTL over60s");
  check(!demo.activate(1,-1,20,60000,0,0),"Demo rejects negative soil");
  check(!demo.activate(1,22,101,60000,0,0),"Demo rejects invalid rain");
  check(!demo.activate(1,std::numeric_limits<float>::quiet_NaN(),20,60000,0,0),"Demo rejects NaN");
  check(demo.activate(1,22,20,60000,100,1800000000),"Demo accepts finite simulated inputs");
  check(demo.weather().simulated && !demo.weather().hasCurrentConditions && !demo.weather().hasPrecipitation,"Demo never fabricates current weather or precipitation");
  PumpController pump;
  pump.update(demo.soil(),true,WeatherState::Valid,demo.weather().maxRainProbabilityPercent,100);
  check(pump.isOn(),"Web demo soil22 rain20 AUTO starts pump");
  demo.activate(2,50,20,60000,200,1800000000);
  demo.confirmLease(2,59000,200);
  check(demo.active() && !demo.takeEnded(),"New demo command is applied before its matching lease, no spurious stop");
  pump.update(demo.soil(),true,WeatherState::Valid,20,200);
  check(pump.isOn(),"Demo soil50 preserves running hysteresis");
  demo.activate(3,22,85,60000,300,1800000000);
  pump.update(demo.soil(),true,WeatherState::Valid,demo.weather().maxRainProbabilityPercent,300);
  check(!pump.isOn() && pump.reason()==PumpReason::RainExpected,"Demo rain85 stops running pump");
  demo.activate(4,22,20,60000,400,1800000000);
  pump.update(demo.soil(),true,WeatherState::Valid,20,400);
  check(!pump.isOn() && pump.reason()==PumpReason::Cooldown,"Changing demo values cannot bypass cooldown");
  pump.update(22,true,WeatherState::Valid,20,5300);
  check(pump.isOn(),"Demo can restart after cooldown");
  demo.activate(5,22,20,60000,6000,1800000000);
  pump.update(22,true,WeatherState::Valid,20,15300);
  check(!pump.isOn() && pump.reason()==PumpReason::RuntimeLimit,"Demo update cannot reset10s pump timer");
  demo.activate(6,80,20,60000,16000,1800000000);
  pump.update(demo.soil(),true,WeatherState::Valid,20,16000);
  check(!pump.isOn() && pump.reason()==PumpReason::SoilWet,"Demo soil80 keeps pump OFF");
  demo.update(false,16001);
  check(!demo.active() && demo.takeEnded() && !demo.takeEnded(),"Backend loss exits demo with one stop transition");
  demo.activate(7,22,20,10000,0,0);demo.confirmLease(7,60000,1000);
  check(demo.remaining(1000)==9000,"Server cannot extend demo lease");
  demo.update(true,9999);check(demo.active(),"Demo valid before TTL boundary");
  demo.update(true,10000);check(!demo.active(),"Demo expires at exact TTL boundary");
  demo.takeEnded();demo.activate(8,22,20,60000,11000,0);demo.confirmLease(8,1000,12000);
  demo.update(true,13000);check(!demo.active(),"Server clock shortens slow-simulation demo lease");
  demo.activate(9,22,20,60000,14000,0);demo.confirmLease(10,60000,14001);
  check(!demo.active(),"A different control lease cancels old demo");
  demo.activate(11,22,20,10000,0xfffffff0U,0);demo.update(true,0x2700U);
  check(!demo.active(),"Demo TTL works across millis rollover");
  DemoSession reboot;
  check(!reboot.active(),"Reboot never resumes a demo session");

  RemoteControl remote;
  check(remote.receiveDemo(1,false,60000,0)==CommandAcceptance::Accepted && remote.mode()==PumpMode::Auto,"Demo selects AUTO, not MANUAL_ON");
  check(remote.receiveDemo(1,false,60000,100)==CommandAcceptance::Duplicate,"Same demo id never renews session");
  remote.receive(2,PumpMode::ManualOff,10000,1000);
  check(remote.receiveDemo(3,false,60000,1001)==CommandAcceptance::OffPriority,"MANUAL_OFF blocks demo start/update");
  check(remote.receiveDemo(4,true,60000,1002)==CommandAcceptance::Accepted && remote.mode()==PumpMode::ManualOff,"Demo stop must not clear MANUAL_OFF");
  remote.update(true,11000);check(remote.mode()==PumpMode::Auto,"Demo stop must not extend MANUAL_OFF lease");
  check(remote.receive(3,PumpMode::ManualOn,10000,11001)==CommandAcceptance::Duplicate,"Shared IDs prevent control replay after demo stop");
}
