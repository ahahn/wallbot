#include <Wire.h>
#include <Servo.h> 
#include <Adafruit_MotorShield.h>
//#include <AccelStepper.h>
//#include <MultiStepper.h>

Adafruit_MotorShield AFMS = Adafruit_MotorShield(); 

Adafruit_StepperMotor *myMotor1 = AFMS.getStepper(200, 1);
Adafruit_StepperMotor *myMotor2 = AFMS.getStepper(200, 2);

#define MOTOR_RIGHT 1
#define MOTOR_LEFT 2
#define MOTOR_RIGHT_FORWARD FORWARD
#define MOTOR_RIGHT_BACKWARD BACKWARD
#define MOTOR_LEFT_FORWARD BACKWARD
#define MOTOR_LEFT_BACKWARD FORWARD
// SINGLE DOUBLE INTERLEAVE MICROSTEP
#define STEPPERCOIL SINGLE
#define STEPPERSPEED 2
#define SERVOUP 150
#define SERVODOWN 90
#define USESERVO 1
#ifdef USESERVO
Servo servo1;
int servoAngle = 150;
#endif

//void forwardstep1() {
//  myMotor1->onestep(MOTOR_RIGHT_FORWARD,STEPPERCOIL);
//}
//void backwardstep1() {
//  myMotor1->onestep(MOTOR_RIGHT_BACKWARD,STEPPERCOIL);
//}
//void forwardstep2() {
//  myMotor2->onestep(MOTOR_LEFT_FORWARD,STEPPERCOIL);
//}
//void backwardstep2() {
//  myMotor2->onestep(MOTOR_LEFT_BACKWARD,STEPPERCOIL);
//}
//
//AccelStepper stepper1(forwardstep1, backwardstep1);
//AccelStepper stepper2(forwardstep2, backwardstep2);

// units in mm
//#define canvasWidth 1000
//#define canvasHeight 700
int canvasWidth = 1000;
int canvasHeight = 700;

int curX = canvasWidth / 2;
int curY = canvasHeight / 2;

int stepsRight = 0;
int stepsLeft = 0;

#ifdef DEBUG
int debug = 0;
#endif

void setup() {
  // put your setup code here, to run once:
  Serial.begin(19200);
  Serial.println("in setup");
  AFMS.begin();
  myMotor1->setSpeed(STEPPERSPEED);
  myMotor2->setSpeed(STEPPERSPEED);
  
//  stepper1.setMaxSpeed(100.0);
//  stepper1.setAcceleration(100.0);
//  stepper2.setMaxSpeed(100.0);
//  stepper2.setAcceleration(100.0);
#ifdef USESERVO
  servo1.attach(10);
  servo1.write(servoAngle);
#endif

  Serial.println("ready");
}

void loop() {
  // put your main code here, to run repeatedly:
  if (Serial.available() > 0) {
    delay(5);
    int c = Serial.read();
    if ((c == '?')||(c == 'h')) {
      Serial.print("{\"result\":{\"lines\":[\"ahahn's wallbot v1.0\",");
      Serial.print("\"Available commands:\",");
      Serial.print("\"p - report current position\",");
      Serial.print("\"o - go to origin\",");
      Serial.print("\"f - free stepper motors for manual position adjustment\",");
      Serial.print("\"g <xdist> <ydist> - go distance mm on each axis from current position\",");
      Serial.print("\"c <width> <height> - set width and height of the current canvas\",");
      Serial.print("\"r <steps> - move right motor <steps>\",");
      Serial.print("\"l <steps> - move left motor <steps>\",");
      Serial.print("\"q - servo back- pen down\",");
      Serial.print("\"u - pen up\",");
      Serial.print("\"d - pen down\",");
      Serial.print("\"e - servo forward- pen up\",");
      Serial.print("\"v <level> - verbose messages level\"");
      Serial.println("]}}");
    } else if (c == 'p') {
      Serial.print("{\"result\": {\"positionX\":");
      Serial.print(curX);
      Serial.print(", \"positionY\": ");
      Serial.print(curY);
      Serial.print(",");
      Serial.print("\"stepsRight\":");
      Serial.print(stepsRight);
      Serial.print(", \"stepsLeft\": ");
      Serial.print(stepsLeft);
      Serial.print(", \"servoAngle\": ");
      Serial.print(servoAngle);
      Serial.println("}}");
    } else if (c == 'o') {
      goOrigin();
      Serial.println("{\"result\": {\"message\": \"at origin\"}}");
    } else if (c == 'u') {
      penUp();
      Serial.println("{\"result\": {\"message\": \"pen up\"}}");
    } else if (c == 'd') {
      penDown();
      Serial.println("{\"result\": {\"message\": \"pen down\"}}");
    } else if (c == 'f') {
      myMotor1->release();
      myMotor2->release();
      Serial.println("{\"result\": {\"message\": \"motors freed\"}}");
    } else if (c == 'r') { 
      int steps = Serial.parseInt();
      step(MOTOR_RIGHT,steps);
      Serial.print("{\"result\": {\"message\": \"right move complete\"},");
      Serial.print("\"stepsRight\":");
      Serial.print(stepsRight);
      Serial.print(", \"stepsLeft\": ");
      Serial.print(stepsLeft);
      Serial.println("}");
    } else if (c == 'l') {
      int steps = Serial.parseInt();
      step(MOTOR_LEFT,steps);
      Serial.print("{\"result\": {\"message\": \"left move complete\"},");
      Serial.print("\"stepsRight\":");
      Serial.print(stepsRight);
      Serial.print(", \"stepsLeft\": ");
      Serial.print(stepsLeft);
      Serial.println("}");
    } else if (c == 'c') {
      int wval = Serial.parseInt();
      int hval = Serial.parseInt();
      canvasWidth = wval;
      canvasHeight = hval;
      curX = canvasWidth / 2;
      curY = canvasHeight / 2;
            
      Serial.print("{\"result\": {\"message\":\"done x command\",");
      Serial.print("\"canvasWidth\":");
      Serial.print(canvasWidth);
      Serial.print(", \"canvasHeight\":");
      Serial.print(canvasHeight);
      Serial.print(", \"positionX\":");
      Serial.print(curX);
      Serial.print(", \"positionY\":");
      Serial.print(curY);
      Serial.println("}}");
    } else if (c == 'g') {
      int xval = Serial.parseInt();
      int yval = Serial.parseInt();
      go(xval,yval,0);
      Serial.print("{\"result\": {\"message\":\"done g command\",");
      Serial.print("\"positionX\":");
      Serial.print(curX);
      Serial.print(", \"positionY\":");
      Serial.print(curY);
      Serial.println("}}");
#ifdef USESERVO
    } else if (c == 'q') {
      if (servoAngle > 5) {
        servoAngle = servoAngle - 5;
        servo1.write(servoAngle);
        delay(10);
      }
      Serial.print("{\"result\":{\"message\":\"pen down\",\"distance\":");
      Serial.print(servoAngle);
      Serial.println("}}");
    } else if (c == 'e') {
      if (servoAngle < (180 - 5)) {
        servoAngle = servoAngle + 5;
        servo1.write(servoAngle);
        delay(10);
      }
      Serial.print("{\"result\":{\"message\":\"pen up\",\"distance\":");
      Serial.print(servoAngle);
      Serial.println("}}");
#endif
    }
  }
}
