#pragma once
#include "RemoteControl.h"

// Chạy controller/policy production với clock mô phỏng; không giả là ESP32 runtime.
void testPhase3() {
  PumpController pump;
  pump.update(50,true,WeatherState::Valid,20,0,PumpMode::ManualOn);
  check(pump.isOn() && pump.reason()==PumpReason::ManualOn,"P3 MANUAL_ON permits soil50 below wet safety limit");
  pump.update(50,true,WeatherState::Valid,20,9999,PumpMode::ManualOn);
  check(pump.isOn(),"P3 manual runtime9999ms ON");
  pump.update(50,true,WeatherState::Valid,20,10000,PumpMode::ManualOn);
  check(!pump.isOn() && pump.reason()==PumpReason::RuntimeLimit,"P3 manual runtime10000ms OFF");
  pump.update(50,true,WeatherState::Valid,20,14999,PumpMode::ManualOn);
  check(!pump.isOn() && pump.reason()==PumpReason::Cooldown,"P3 manual cannot bypass cooldown4999ms");
  pump.update(50,true,WeatherState::Valid,20,15000,PumpMode::ManualOn);
  check(pump.isOn(),"P3 new manual request may start after5000ms cooldown");
  pump.update(20,false,WeatherState::Unknown,85,15001,PumpMode::ManualOff);
  check(!pump.isOn() && pump.reason()==PumpReason::ManualOff,"P3 OFF takes priority over weather/wifi");
  pump.update(20,true,WeatherState::Valid,20,15002);
  check(!pump.isOn() && pump.reason()==PumpReason::Cooldown,"P3 OFF transition records cooldown");
  PumpController guards;
  guards.update(20,true,WeatherState::Unknown,20,0,PumpMode::ManualOn);
  check(!guards.isOn() && guards.reason()==PumpReason::WeatherUnavailable,"P3 manual UNKNOWN rejected");
  guards.update(20,true,WeatherState::Stale,20,1,PumpMode::ManualOn);
  check(!guards.isOn(),"P3 manual STALE rejected");
  guards.update(20,false,WeatherState::Valid,20,2,PumpMode::ManualOn);
  check(!guards.isOn(),"P3 manual wifi disconnected rejected");
  guards.update(20,true,WeatherState::Valid,85,3,PumpMode::ManualOn);
  check(!guards.isOn() && guards.reason()==PumpReason::RainExpected,"P3 manual rain85 rejected");
  guards.update(70,true,WeatherState::Valid,20,4,PumpMode::ManualOn);
  check(!guards.isOn() && guards.reason()==PumpReason::SoilWet,"P3 manual soil70 rejected");
  guards.update(20,true,WeatherState::Valid,20,5,PumpMode::ManualOn);
  guards.update(20,true,WeatherState::Valid,85,6,PumpMode::ManualOn);
  check(!guards.isOn() && guards.reason()==PumpReason::RainExpected,"P3 manual running stops for rain85");

  RemoteControl remote;
  check(remote.mode()==PumpMode::Auto,"P3 boot defaults AUTO");
  check(remote.receive(1,PumpMode::ManualOn,10000,100)==CommandAcceptance::Accepted,"P3 accept finite lease");
  remote.update(true,10099);check(remote.mode()==PumpMode::ManualOn,"P3 lease9999ms valid");
  check(remote.receive(1,PumpMode::ManualOn,10000,10099)==CommandAcceptance::Duplicate,"P3 duplicate does not renew lease");
  remote.update(true,10100);check(remote.mode()==PumpMode::Auto,"P3 lease expires exact boundary");
  check(remote.receive(2,PumpMode::ManualOn,0,10101)==CommandAcceptance::Expired,"P3 zeroTTL rejected");
  check(remote.receive(3,PumpMode::ManualOn,60001,10101)==CommandAcceptance::Expired,"P3 excessiveTTL rejected");
  remote.receive(4,PumpMode::ManualOn,10000,11000);remote.finishManualOn();
  check(remote.mode()==PumpMode::Auto,"P3 one-shot ends after stop/rejection");
  check(remote.receive(4,PumpMode::ManualOn,10000,11001)==CommandAcceptance::Duplicate,"P3 completed manual command never restarted");
  remote.receive(5,PumpMode::ManualOff,10000,12000);
  check(remote.receive(6,PumpMode::ManualOn,10000,12001)==CommandAcceptance::OffPriority && remote.mode()==PumpMode::ManualOff,"P3 OFF cannot be superseded by ON");
  check(remote.receive(7,PumpMode::Auto,10000,12002)==CommandAcceptance::OffPriority,"P3 OFF cannot be superseded by AUTO before TTL");
  remote.update(false,12003);check(remote.mode()==PumpMode::Auto,"P3 backend outage returns safe AUTO");
  remote.receive(8,PumpMode::ManualOn,10000,0xfffffff0U);
  remote.update(true,0x26ffU);check(remote.mode()==PumpMode::ManualOn,"P3 millis rollover before TTL");
  remote.update(true,0x2700U);check(remote.mode()==PumpMode::Auto,"P3 millis rollover TTL expiration");
  RemoteControl serverLease;
  serverLease.receive(1,PumpMode::ManualOff,10000,0);
  serverLease.confirmLease(1,20000,1000);serverLease.update(true,10000);
  check(serverLease.mode()==PumpMode::Auto,"P3 server response cannot extend original TTL");
  serverLease.receive(2,PumpMode::ManualOff,10000,11000);
  serverLease.confirmLease(2,1000,12000);serverLease.update(true,13000);
  check(serverLease.mode()==PumpMode::Auto,"P3 server clock may shorten lease for slow Wokwi");
  serverLease.receive(3,PumpMode::ManualOff,10000,14000);serverLease.confirmLease(3,0,14001);
  check(serverLease.mode()==PumpMode::Auto,"P3 server expiration immediately invalidates manual mode");
}
